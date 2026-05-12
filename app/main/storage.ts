import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import {
  ApprovalMode,
  AppSettings,
  ChatSession,
  ChatUsageSnapshot,
  CliActivity,
  Message,
  PersistedAppData,
  Workspace
} from "../shared/types";
import { getRuntimeConfig } from "./runtime-config";

function createDefaultUsageSnapshot(): ChatUsageSnapshot {
  return {
    requestCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    totalTokens: 0
  };
}

function createDefaultChatFields(settings: AppSettings): Pick<ChatSession, "model" | "approvalMode" | "sandbox" | "usage"> {
  return {
    model: settings.preferredModel,
    approvalMode: settings.preferredApprovalMode,
    sandbox: settings.preferredSandbox,
    usage: createDefaultUsageSnapshot()
  };
}

function createDefaultSettings(): AppSettings {
  const runtimeConfig = getRuntimeConfig();
  return {
    theme: "dark-codex",
    density: "comfortable",
    cliPath: runtimeConfig.cli.defaultExecutable,
    preferredModel: runtimeConfig.models[0]?.id ?? "auto",
    preferredApprovalMode: "default",
    preferredSandbox: true,
    preferredSandboxMode: "auto"
  };
}

function createDefaultData(): PersistedAppData {
  return {
    settings: createDefaultSettings(),
    workspaces: [],
    chats: [],
    messages: [],
    activities: []
  };
}

export class JsonStore {
  private readonly filePath: string;
  private data: PersistedAppData;

  constructor() {
    const userData = app.getPath("userData");
    this.filePath = path.join(userData, "app-state.json");
    fs.mkdirSync(userData, { recursive: true });
    this.data = this.load();
  }

  private load(): PersistedAppData {
    const defaultData = createDefaultData();
    if (!fs.existsSync(this.filePath)) {
      this.persist(defaultData);
      return structuredClone(defaultData);
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PersistedAppData>;

    return {
      settings: { ...defaultData.settings, ...parsed.settings },
      workspaces: parsed.workspaces ?? [],
      chats: (parsed.chats ?? []).map((chat) => ({
        ...createDefaultChatFields({ ...defaultData.settings, ...parsed.settings }),
        ...chat,
        usage: { ...createDefaultUsageSnapshot(), ...chat.usage }
      })),
      messages: parsed.messages ?? [],
      activities: parsed.activities ?? []
    };
  }

  private persist(next: PersistedAppData): void {
    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), "utf8");
  }

  getData(): PersistedAppData {
    return structuredClone(this.data);
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.data.settings = { ...this.data.settings, ...patch };
    this.persist(this.data);
    return this.data.settings;
  }

  getSettings(): AppSettings {
    return structuredClone(this.data.settings);
  }

  listWorkspaces(): Workspace[] {
    return structuredClone(this.data.workspaces);
  }

  saveWorkspace(workspace: Workspace): Workspace {
    const index = this.data.workspaces.findIndex((item) => item.id === workspace.id);
    if (index >= 0) {
      this.data.workspaces[index] = workspace;
    } else {
      this.data.workspaces.unshift(workspace);
    }
    this.persist(this.data);
    return workspace;
  }

  listChats(workspaceId: string): ChatSession[] {
    return this.data.chats
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => ({ ...item }));
  }

  saveChat(chat: ChatSession): ChatSession {
    const index = this.data.chats.findIndex((item) => item.id === chat.id);
    const normalizedChat: ChatSession = {
      ...createDefaultChatFields(this.data.settings),
      ...chat,
      usage: { ...createDefaultUsageSnapshot(), ...chat.usage }
    };
    if (index >= 0) {
      this.data.chats[index] = normalizedChat;
    } else {
      this.data.chats.unshift(normalizedChat);
    }
    this.persist(this.data);
    return normalizedChat;
  }

  getChatPayload(chatId: string) {
    const session = this.data.chats.find((item) => item.id === chatId);
    if (!session) {
      return null;
    }
    return {
      session: { ...session },
      messages: this.data.messages.filter((item) => item.chatId === chatId).map((item) => ({ ...item })),
      activities: this.data.activities.filter((item) => item.chatId === chatId).map((item) => ({ ...item }))
    };
  }

  deleteChat(chatId: string): void {
    this.data.chats = this.data.chats.filter((item) => item.id !== chatId);
    this.data.messages = this.data.messages.filter((item) => item.chatId !== chatId);
    this.data.activities = this.data.activities.filter((item) => item.chatId !== chatId);

    if (this.data.settings.activeChatId === chatId) {
      this.data.settings.activeChatId = undefined;
    }

    this.persist(this.data);
  }

  saveMessage(message: Message): Message {
    const index = this.data.messages.findIndex((item) => item.id === message.id);
    if (index >= 0) {
      this.data.messages[index] = message;
    } else {
      this.data.messages.push(message);
    }
    this.persist(this.data);
    return message;
  }

  saveActivity(activity: CliActivity): CliActivity {
    const index = this.data.activities.findIndex((item) => item.id === activity.id);
    if (index >= 0) {
      this.data.activities[index] = activity;
    } else {
      this.data.activities.push(activity);
    }
    this.persist(this.data);
    return activity;
  }

  appendAssistantToken(chatId: string, token: string): Message | null {
    for (let index = this.data.messages.length - 1; index >= 0; index -= 1) {
      const message = this.data.messages[index];
      if (message.chatId === chatId && message.role === "assistant" && message.status === "streaming") {
        const next = { ...message, content: message.content + token };
        this.data.messages[index] = next;
        this.persist(this.data);
        return next;
      }
    }
    return null;
  }

  finalizeAssistant(chatId: string): Message | null {
    for (let index = this.data.messages.length - 1; index >= 0; index -= 1) {
      const message = this.data.messages[index];
      if (message.chatId === chatId && message.role === "assistant" && message.status === "streaming") {
        const next = { ...message, status: "done" as const };
        this.data.messages[index] = next;
        this.persist(this.data);
        return next;
      }
    }
    return null;
  }

  failAssistant(chatId: string, errorText: string): Message | null {
    for (let index = this.data.messages.length - 1; index >= 0; index -= 1) {
      const message = this.data.messages[index];
      if (message.chatId === chatId && message.role === "assistant" && message.status === "streaming") {
        const next = { ...message, status: "error" as const, content: message.content || errorText };
        this.data.messages[index] = next;
        this.persist(this.data);
        return next;
      }
    }
    return null;
  }
}
