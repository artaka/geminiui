import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { AppSettings, AuthState, ChatSession, ChatUsageSnapshot, CliHealth, Message, Workspace } from "../shared/types";
import { GeminiCliManager } from "./cli";
import { DiagnosticsManager } from "./diagnostics";
import { EnvironmentManager } from "./environment";
import { RuntimeConfigFile } from "./runtime-config";
import { JsonStore } from "./storage";

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function registerIpcHandlers(deps: {
  store: JsonStore;
  cli: GeminiCliManager;
  diagnostics: DiagnosticsManager;
  environment: EnvironmentManager;
  runtimeConfig: RuntimeConfigFile;
}) {
  const { store, cli, diagnostics, environment, runtimeConfig } = deps;

  const deriveAuthState = (cliHealth: CliHealth, manualAuthConfirmed?: boolean): AuthState => {
    if (!cliHealth.installed) {
      return "signed_out";
    }
    if (cliHealth.authenticated || manualAuthConfirmed) {
      return "signed_in";
    }
    return "signed_out";
  };

  const mergeUsage = (current: ChatUsageSnapshot, nextStats: unknown): ChatUsageSnapshot => {
    const next = {
      requestCount: current.requestCount + 1,
      inputTokens: current.inputTokens,
      outputTokens: current.outputTokens,
      cachedTokens: current.cachedTokens,
      totalTokens: current.totalTokens,
      lastUpdatedAt: new Date().toISOString()
    };

    const visitTokenContainer = (value: unknown) => {
      if (!value || typeof value !== "object") {
        return;
      }
      const record = value as Record<string, unknown>;
      const readNumber = (...keys: string[]) => {
        for (const key of keys) {
          const candidate = record[key];
          if (typeof candidate === "number" && Number.isFinite(candidate)) {
            return candidate;
          }
        }
        return 0;
      };

      next.inputTokens += readNumber("inputTokens", "input_tokens", "promptTokens", "prompt_tokens");
      next.outputTokens += readNumber("outputTokens", "output_tokens", "responseTokens", "response_tokens", "candidateTokens", "candidatesTokens");
      next.cachedTokens += readNumber("cachedTokens", "cached_tokens", "cacheReadTokens", "cache_read_tokens");
      next.totalTokens += readNumber("totalTokens", "total_tokens");
    };

    if (nextStats && typeof nextStats === "object") {
      const statsRecord = nextStats as Record<string, unknown>;
      if (statsRecord.models && typeof statsRecord.models === "object") {
        for (const modelStat of Object.values(statsRecord.models as Record<string, unknown>)) {
          if (modelStat && typeof modelStat === "object") {
            const modelRecord = modelStat as Record<string, unknown>;
            visitTokenContainer(modelRecord.tokens);
          }
        }
      } else {
        visitTokenContainer(statsRecord.tokens);
        visitTokenContainer(statsRecord);
      }
    }

    if (next.totalTokens === current.totalTokens) {
      next.totalTokens = next.inputTokens + next.outputTokens + next.cachedTokens;
    }

    return next;
  };

  cli.subscribe((event) => {
    if (event.type === "assistant_token") {
      store.appendAssistantToken(event.chatId, event.token);
      return;
    }

    if (event.type === "activity") {
      store.saveActivity(event.activity);
      return;
    }

    if (event.type === "session_initialized") {
      const payload = store.getChatPayload(event.chatId);
      if (!payload) {
        return;
      }
      store.saveChat({
        ...payload.session,
        cliSessionId: event.sessionId,
        model: event.model ?? payload.session.model,
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (event.type === "run_summary") {
      const payload = store.getChatPayload(event.chatId);
      if (!payload) {
        return;
      }
      store.saveChat({
        ...payload.session,
        cliSessionId: event.sessionId ?? payload.session.cliSessionId,
        model: event.model ?? payload.session.model,
        usage: mergeUsage(payload.session.usage, event.stats),
        updatedAt: new Date().toISOString()
      });
      return;
    }

    if (event.type === "completed") {
      store.finalizeAssistant(event.chatId);
      return;
    }

    if (event.type === "error") {
      store.failAssistant(event.chatId, event.message);
    }
  });

  ipcMain.handle("settings:get", () => store.getSettings());
  ipcMain.handle("settings:update", (_event, patch: Partial<AppSettings>) => {
    const settings = store.updateSettings(patch);
    cli.setCliPath(settings.cliPath);
    return settings;
  });

  ipcMain.handle("projects:list", () => {
    return store.listWorkspaces().map((workspace) => ({
      ...workspace,
      isMissing: !fs.existsSync(workspace.path)
    }));
  });

  ipcMain.handle("projects:add", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const workspacePath = result.filePaths[0];
    const workspace: Workspace = {
      id: createId("workspace"),
      name: path.basename(workspacePath),
      path: workspacePath,
      lastOpenedAt: new Date().toISOString()
    };

    store.saveWorkspace(workspace);
    store.updateSettings({ activeWorkspaceId: workspace.id });
    return workspace;
  });

  ipcMain.handle("projects:setActive", (_event, workspaceId: string) => {
    store.updateSettings({ activeWorkspaceId: workspaceId, activeChatId: undefined });
  });

  ipcMain.handle("chat:list", (_event, workspaceId: string) => store.listChats(workspaceId));

  ipcMain.handle("chat:create", (_event, workspaceId: string) => {
    const settings = store.getSettings();
    const now = new Date().toISOString();
    const chat: ChatSession = {
      id: createId("chat"),
      workspaceId,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
      model: settings.preferredModel,
      approvalMode: settings.preferredApprovalMode,
      sandbox: settings.preferredSandbox,
      usage: {
        requestCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0
      }
    };
    store.saveChat(chat);
    store.updateSettings({ activeChatId: chat.id, activeWorkspaceId: workspaceId });
    return chat;
  });

  ipcMain.handle("chat:open", (_event, chatId: string) => {
    return store.getChatPayload(chatId);
  });

  ipcMain.handle("chat:update", (_event, payload: { chatId: string; patch: Partial<ChatSession> }) => {
    const chatPayload = store.getChatPayload(payload.chatId);
    if (!chatPayload) {
      throw new Error("Chat not found.");
    }

    const updatedChat = store.saveChat({
      ...chatPayload.session,
      ...payload.patch,
      updatedAt: new Date().toISOString()
    });
    return updatedChat;
  });

  ipcMain.handle("chat:send", async (_event, payload: { chatId: string; prompt: string; assumeAuthenticated?: boolean }) => {
    const chatPayload = store.getChatPayload(payload.chatId);
    if (!chatPayload) {
      throw new Error("Chat not found.");
    }

    const workspace = store.listWorkspaces().find((item) => item.id === chatPayload.session.workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found.");
    }

    const createdAt = new Date().toISOString();
    const userMessage: Message = {
      id: createId("msg"),
      chatId: payload.chatId,
      role: "user",
      content: payload.prompt,
      status: "done",
      createdAt
    };
    const assistantMessage: Message = {
      id: createId("msg"),
      chatId: payload.chatId,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date().toISOString()
    };

    const nextTitle = payload.prompt.slice(0, 48) || chatPayload.session.title;
    store.saveMessage(userMessage);
    store.saveMessage(assistantMessage);
    store.saveChat({
      ...chatPayload.session,
      title: nextTitle,
      updatedAt: new Date().toISOString()
    });
    store.updateSettings({ activeChatId: payload.chatId, activeWorkspaceId: workspace.id });

    await cli.sendPrompt(payload.chatId, payload.prompt, workspace.path, {
      sessionId: chatPayload.session.cliSessionId,
      model: chatPayload.session.model,
      approvalMode: chatPayload.session.approvalMode,
      sandbox: chatPayload.session.sandbox,
      assumeAuthenticated: payload.assumeAuthenticated
    });

    return { userMessage, assistantMessage };
  });

  ipcMain.handle("chat:stop", (_event, chatId: string) => {
    cli.stop(chatId);
  });

  ipcMain.handle("cli:getStatus", () => cli.getStatus());
  ipcMain.handle("cli:recheck", () => cli.checkHealth());
  ipcMain.handle("cli:openLogin", () => {
    cli.openLoginShell();
  });
  ipcMain.handle("cli:install", () => {
    environment.openInstallTerminal();
  });
  ipcMain.handle("environment:getStatus", () => environment.getStatus());

  ipcMain.handle("diagnostics:getSnapshot", async () => {
    const settings = store.getSettings();
    const workspace = store.listWorkspaces().find((item) => item.id === settings.activeWorkspaceId);
    const cliHealth = await cli.checkHealth();
    return diagnostics.getSnapshot(cli.getStatus(), settings.cliPath, deriveAuthState(cliHealth, settings.manualAuthConfirmed), workspace);
  });

  ipcMain.handle("diagnostics:exportLogs", async () => {
    const settings = store.getSettings();
    const workspace = store.listWorkspaces().find((item) => item.id === settings.activeWorkspaceId);
    const cliHealth = await cli.checkHealth();
    const snapshot = diagnostics.getSnapshot(
      cli.getStatus(),
      settings.cliPath,
      deriveAuthState(cliHealth, settings.manualAuthConfirmed),
      workspace
    );
    return diagnostics.exportLogs(snapshot);
  });

  ipcMain.handle("bootstrap:load", async () => {
    const settings = store.getSettings();
    const workspaces = store.listWorkspaces().map((workspace) => ({
      ...workspace,
      isMissing: !fs.existsSync(workspace.path)
    }));
    const activeWorkspace = workspaces.find((item) => item.id === settings.activeWorkspaceId) ?? null;
    const chats = activeWorkspace ? store.listChats(activeWorkspace.id) : [];
    const activeChatCandidate = settings.activeChatId ? store.getChatPayload(settings.activeChatId) : null;
    const activeChat =
      activeWorkspace && activeChatCandidate?.session.workspaceId === activeWorkspace.id
        ? activeChatCandidate
        : null;
    let cliHealth = await cli.checkHealth();
    if (settings.manualAuthConfirmed && cliHealth.installed) {
      cliHealth = {
        ...cliHealth,
        authenticated: true,
        status: "connected",
        message: "Gemini CLI was manually confirmed as signed in."
      };
    }

    return {
      session: null,
      settings,
      workspaces,
      activeWorkspace,
      chats,
      activeChat,
      cliStatus: cliHealth.status,
      cliHealth,
      environment: await environment.getStatus(),
      models: runtimeConfig.models
    };
  });

  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle("window:toggleMaximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return window.isMaximized();
  });

  ipcMain.handle("window:isMaximized", (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}
