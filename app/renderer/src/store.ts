import { create } from "zustand";
import {
  AppSettings,
  ChatSession,
  ChatSessionPayload,
  CliActivity,
  CliEvent,
  CliHealth,
  CliStatus,
  DiagnosticsSnapshot,
  EnvironmentStatus,
  Message,
  PendingAttachment,
  RuntimeModelOption,
  UpdateState,
  UserSession,
  Workspace
} from "@shared/types";

interface BootstrapPayload {
  session: UserSession | null;
  settings: AppSettings;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  chats: ChatSession[];
  activeChat: ChatSessionPayload | null;
  cliStatus: CliStatus;
  activeRunChatId: string | null;
  cliHealth: CliHealth | null;
  environment: EnvironmentStatus;
  models: RuntimeModelOption[];
  diagnostics: DiagnosticsSnapshot;
}

interface AppState {
  bootstrapped: boolean;
  loading: boolean;
  checkingCli: boolean;
  error?: string;
  session: UserSession | null;
  settings: AppSettings | null;
  workspaces: Workspace[];
  chats: ChatSession[];
  activeWorkspace: Workspace | null;
  activeChat: ChatSessionPayload | null;
  cliStatus: CliStatus;
  activeRunChatId: string | null;
  cliHealth: CliHealth | null;
  environment: EnvironmentStatus | null;
  models: RuntimeModelOption[];
  diagnostics: DiagnosticsSnapshot | null;
  activeScreen: "chat" | "settings" | "search" | "projects";
  searchResults: Array<{ chat: ChatSession; message?: Message }>;
  searchQuery: string;
  updateState: UpdateState;
  bootstrap(): Promise<void>;
  addWorkspace(): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  selectWorkspace(workspaceId: string): Promise<void>;
  createChat(): Promise<void>;
  openChat(chatId: string): Promise<void>;
  deleteChat(chatId: string): Promise<void>;
  updateChat(chatId: string, patch: Partial<ChatSession>): Promise<void>;
  sendPrompt(prompt: string, attachments?: PendingAttachment[]): Promise<void>;
  stopPrompt(): Promise<void>;
  revertChangeSet(changeSetId: string, relativePath?: string): Promise<void>;
  openPath(filePath: string): Promise<void>;
  loadDiagnostics(): Promise<void>;
  exportLogs(): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  recheckCli(): Promise<void>;
  confirmCliAuth(): Promise<void>;
  openCliLogin(): Promise<void>;
  installCli(): Promise<void>;
  setupSandbox(): Promise<void>;
  setScreen(screen: "chat" | "settings" | "search" | "projects"): void;
  search(query: string): Promise<void>;
  suggestFiles(query: string): Promise<string[]>;
  applyCliEvent(event: CliEvent): void;
  checkForUpdates(): Promise<void>;
  quitAndInstall(): Promise<void>;
}

let bootstrapPromise: Promise<void> | null = null;

function mergeUsageSnapshot(current: ChatSession["usage"], nextStats: unknown, updatedAt: string): ChatSession["usage"] {
  const next = {
    requestCount: current.requestCount + 1,
    inputTokens: current.inputTokens,
    outputTokens: current.outputTokens,
    cachedTokens: current.cachedTokens,
    totalTokens: current.totalTokens,
    lastUpdatedAt: updatedAt
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
          visitTokenContainer((modelStat as Record<string, unknown>).tokens);
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
}

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapped: false,
  loading: true,
  checkingCli: false,
  session: null,
  settings: null,
  workspaces: [],
  chats: [],
  activeWorkspace: null,
  activeChat: null,
  cliStatus: "stopped",
  activeRunChatId: null,
  cliHealth: null,
  environment: null,
  models: [],
  diagnostics: null,
  activeScreen: "chat",
  searchResults: [],
  searchQuery: "",
  updateState: { status: "idle" },

  async bootstrap() {
    if (get().bootstrapped) {
      return;
    }

    if (bootstrapPromise) {
      return bootstrapPromise;
    }

    bootstrapPromise = (async () => {
      set({ loading: true, error: undefined });
      try {
        const payload = (await window.gemini.bootstrap.load()) as BootstrapPayload;
        set({
          bootstrapped: true,
          loading: false,
          session: payload.session,
          settings: payload.settings,
          workspaces: payload.workspaces,
          activeWorkspace: payload.activeWorkspace,
          chats: payload.chats,
          activeChat: payload.activeChat,
          cliStatus: payload.cliStatus,
          activeRunChatId: payload.activeRunChatId,
          cliHealth: payload.cliHealth,
          environment: payload.environment,
          models: payload.models,
          diagnostics: payload.diagnostics
        });

        // Initialize updater state and listener
        try {
          const initialUpdateState = await window.gemini.updater.getStatus();
          set({ updateState: initialUpdateState });

          window.gemini.updater.onStateChanged((state) => {
            set({ updateState: state });
          });
        } catch (err) {
          console.error("Failed to initialize updater:", err);
        }

        if (payload.settings.activeChatId) {
          void get().openChat(payload.settings.activeChatId);
        }
      } catch (error) {
        set({ loading: false, error: error instanceof Error ? error.message : String(error) });
      } finally {
        bootstrapPromise = null;
      }
    })();

    return bootstrapPromise;
  },

  async addWorkspace() {
    const workspace = await window.gemini.projects.add();
    if (!workspace) {
      return;
    }
    const workspaces = await window.gemini.projects.list();
    set({ workspaces, activeWorkspace: workspace });
    const chat = await window.gemini.chat.create(workspace.id);
    const activeChat = await window.gemini.chat.open(chat.id);
    const chats = await window.gemini.chat.list(workspace.id);
    set({ chats, activeChat });
  },

  async deleteWorkspace(workspaceId: string) {
    const result = await window.gemini.projects.delete(workspaceId);
    const nextActiveWorkspace = result.workspaces.find((workspace) => workspace.id === result.activeWorkspaceId) ?? result.workspaces[0] ?? null;
    const nextChats = nextActiveWorkspace ? await window.gemini.chat.list(nextActiveWorkspace.id) : [];
    const nextActiveChat = nextChats[0] ? await window.gemini.chat.open(nextChats[0].id) : null;
    set({
      workspaces: result.workspaces,
      activeWorkspace: nextActiveWorkspace,
      chats: nextChats,
      activeChat: nextActiveChat
    });
  },

  async selectWorkspace(workspaceId: string) {
    try {
      await window.gemini.projects.setActive(workspaceId);
      const workspaces = await window.gemini.projects.list();
      const activeWorkspace = workspaces.find((item) => item.id === workspaceId) ?? null;
      const chats = activeWorkspace ? await window.gemini.chat.list(activeWorkspace.id) : [];
      const activeChat = chats.length > 0 ? await window.gemini.chat.open(chats[0].id) : null;
      set({ workspaces, activeWorkspace, chats, activeChat, error: undefined });
    } catch (error) {
      set({
        activeWorkspace: null,
        activeChat: null,
        chats: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  async createChat() {
    const workspace = get().activeWorkspace;
    if (!workspace) {
      return;
    }
    const chat = await window.gemini.chat.create(workspace.id);
    const activeChat = await window.gemini.chat.open(chat.id);
    const chats = await window.gemini.chat.list(workspace.id);
    set({ activeChat, chats });
  },

  async openChat(chatId: string) {
    if (get().activeChat?.session.id === chatId && !get().loading) {
      return;
    }

    set({ loading: true, error: undefined });
    try {
      const activeChat = await window.gemini.chat.open(chatId);
      if (activeChat) {
        set({ activeChat, loading: false });
      } else {
        set({ loading: false });
      }
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  async deleteChat(chatId: string) {
    const activeWorkspace = get().activeWorkspace;
    if (!activeWorkspace) {
      return;
    }

    await window.gemini.chat.delete(chatId);
    const chats = await window.gemini.chat.list(activeWorkspace.id);
    const nextActiveChat = chats[0] ? await window.gemini.chat.open(chats[0].id) : null;
    set({
      chats,
      activeChat: nextActiveChat
    });
  },

  async updateChat(chatId, patch) {
    const updatedChat = await window.gemini.chat.update(chatId, patch);
    set((state) => ({
      chats: state.chats.map((chat) => (chat.id === chatId ? updatedChat : chat)),
      activeChat: state.activeChat && state.activeChat.session.id === chatId ? { ...state.activeChat, session: updatedChat } : state.activeChat
    }));
  },

  async sendPrompt(prompt: string, attachments: PendingAttachment[] = []) {
    const activeChat = get().activeChat;
    if (!activeChat) {
      return;
    }
    const activeRunChatId = get().activeRunChatId;
    if (activeRunChatId) {
      set({
        error: activeRunChatId === activeChat.session.id ? "An agent is already running in this chat." : "An agent is already running in another chat. Wait for it to finish before sending a new request."
      });
      return;
    }

    const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const userMessage: Message = {
      id: userMessageId,
      chatId: activeChat.session.id,
      role: "user",
      content: prompt,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        kind: attachment.kind,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
        previewUrl: attachment.previewUrl
      })),
      status: "done",
      createdAt: new Date().toISOString()
    };
    const assistantMessage: Message = {
      id: assistantMessageId,
      chatId: activeChat.session.id,
      role: "assistant",
      content: "",
      status: "streaming",
      createdAt: new Date().toISOString()
    };

    set({
      activeChat: {
        ...activeChat,
        messages: [...activeChat.messages, userMessage, assistantMessage]
      },
      cliStatus: "starting",
      activeRunChatId: activeChat.session.id
    });

    try {
      await window.gemini.chat.send(
        activeChat.session.id,
        prompt,
        attachments,
        get().settings?.manualAuthConfirmed,
        userMessageId,
        assistantMessageId
      );

      const workspace = get().activeWorkspace;
      if (workspace) {
        const chats = await window.gemini.chat.list(workspace.id);
        const refreshedActiveChat = await window.gemini.chat.open(activeChat.session.id);
        set({ chats, activeChat: refreshedActiveChat ?? get().activeChat });
      }
    } catch (error) {
      set((state) => {
        if (!state.activeChat || state.activeChat.session.id !== activeChat.session.id) {
          return {
            cliStatus: "error" as const,
            activeRunChatId: state.activeRunChatId === activeChat.session.id ? null : state.activeRunChatId,
            error: error instanceof Error ? error.message : String(error)
          };
        }

        const messages = state.activeChat.messages.map((message, index, all) => {
          if (index === all.length - 1 && message.role === "assistant" && message.status === "streaming") {
            return {
              ...message,
              status: "error" as const,
              content: message.content || (error instanceof Error ? error.message : String(error))
            };
          }
          return message;
        });

        return {
          activeChat: { ...state.activeChat, messages },
          cliStatus: "error" as const,
          activeRunChatId: state.activeRunChatId === activeChat.session.id ? null : state.activeRunChatId,
          error: error instanceof Error ? error.message : String(error)
        };
      });
    }
  },

  async stopPrompt() {
    const activeChat = get().activeChat;
    if (!activeChat) {
      return;
    }
    await window.gemini.chat.stop(activeChat.session.id);
  },

  async revertChangeSet(changeSetId: string, relativePath?: string) {
    const activeChat = get().activeChat;
    if (!activeChat) {
      return;
    }
    const nextPayload = await window.gemini.chat.revertChangeSet(activeChat.session.id, changeSetId, relativePath);
    set({ activeChat: nextPayload });
  },

  async openPath(filePath: string) {
    await window.gemini.chat.openPath(filePath);
  },

  async loadDiagnostics() {
    const diagnostics = await window.gemini.diagnostics.getSnapshot();
    set({ diagnostics });
  },

  async exportLogs() {
    await window.gemini.diagnostics.exportLogs();
    await get().loadDiagnostics();
  },

  async updateSettings(patch) {
    const settings = await window.gemini.settings.update(patch);
    set({ settings });
  },

  async recheckCli() {
    if (get().checkingCli) {
      return;
    }

    set({ checkingCli: true, error: undefined });
    try {
      const cliHealth = await window.gemini.cli.recheck();
      const environment = await window.gemini.environment.getStatus();
      set({ cliHealth, cliStatus: cliHealth.status, checkingCli: false, environment });
    } catch (error) {
      set({
        checkingCli: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  async confirmCliAuth() {
    const settings = await window.gemini.settings.update({ manualAuthConfirmed: true });
    set((state) => ({
      settings,
      cliHealth: state.cliHealth
        ? {
            ...state.cliHealth,
            authenticated: true,
            status: "connected",
            message: "Gemini CLI was manually confirmed as signed in."
          }
        : state.cliHealth,
      cliStatus: "connected",
      error: undefined
    }));
  },

  async openCliLogin() {
    try {
      await window.gemini.cli.openLogin();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  async installCli() {
    try {
      await window.gemini.cli.install();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  async setupSandbox() {
    try {
      await window.gemini.environment.setupSandbox();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  setScreen(screen) {
    set({ activeScreen: screen });
  },

  async search(query) {
    set({ searchQuery: query, loading: true });
    try {
      const results = await window.gemini.chat.search(query);
      set({ searchResults: results, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  },

  async suggestFiles(query: string) {
    const workspace = get().activeWorkspace;
    if (!workspace) return [];
    try {
      return await window.gemini.projects.suggestFiles(workspace.id, query);
    } catch (error) {
      console.error("Failed to suggest files:", error);
      return [];
    }
  },

  async checkForUpdates() {
    await window.gemini.updater.checkForUpdates();
  },

  async quitAndInstall() {
    await window.gemini.updater.quitAndInstall();
  },

  applyCliEvent(event) {
    try {
      set((state) => {
      const activeChat = state.activeChat;
      const nextRunChatIdForStatus = event.type === "status"
        ? event.status === "starting" || event.status === "busy" || event.status === "streaming"
          ? event.chatId
          : state.activeRunChatId === event.chatId
            ? null
            : state.activeRunChatId
        : state.activeRunChatId;
      if (!activeChat || activeChat.session.id !== event.chatId) {
        return {
          cliStatus: event.type === "status" ? event.status : state.cliStatus,
          activeRunChatId:
            event.type === "assistant_token"
              ? event.chatId
              : event.type === "completed" || event.type === "error"
                ? state.activeRunChatId === event.chatId ? null : state.activeRunChatId
                : nextRunChatIdForStatus,
          cliHealth: event.type === "status" && state.cliHealth ? { ...state.cliHealth, status: event.status } : state.cliHealth
        };
      }

      if (event.type === "assistant_token") {
        let fallbackAssistantId = event.messageId;
        if (!fallbackAssistantId) {
          for (let i = activeChat.messages.length - 1; i >= 0; i--) {
            const m = activeChat.messages[i];
            if (m.role === "assistant" && m.status === "streaming") {
              fallbackAssistantId = m.id;
              break;
            }
          }
        }

        const messages = activeChat.messages.map((message) =>
          message.role === "assistant" && message.id === fallbackAssistantId
            ? {
                ...message,
                status: "streaming" as const,
                content: message.content + event.token
              }
            : message
        );
        return {
          activeChat: { ...activeChat, messages },
          cliStatus: "streaming",
          activeRunChatId: event.chatId
        };
      }

      if (event.type === "activity") {
        const existingActivityIndex = activeChat.activities.findIndex((activity) => activity.id === event.activity.id && activity.messageId === event.activity.messageId);
        let nextActivities: CliActivity[];
        if (existingActivityIndex >= 0) {
          nextActivities = activeChat.activities.map((activity, index) =>
            index === existingActivityIndex ? event.activity : activity
          );
        } else {
          nextActivities = [...activeChat.activities, event.activity];
        }

        if (nextActivities.length > 200) {
          nextActivities = nextActivities.slice(-200);
        }

        const nextSession =
          event.activity.suggestedChatTitle && event.activity.suggestedChatTitle.trim()
            ? {
                ...activeChat.session,
                title: event.activity.suggestedChatTitle
                  .trim()
                  .replace(/\*\*/g, "")
                  .replace(/^\s*topic:\s*/i, "")
                  .replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "")
                  .replace(/\s+/g, " ")
                  .trim()
                  .slice(0, 96)
              }
            : activeChat.session;

        return {
          activeChat: {
            ...activeChat,
            session: nextSession,
            activities: nextActivities
          },
          chats:
            nextSession === activeChat.session
              ? state.chats
              : state.chats.map((chat) => (chat.id === event.chatId ? nextSession : chat))
        };
      }

      if (event.type === "session_initialized") {
        const nextSession = {
          ...activeChat.session,
          cliSessionId: event.sessionId,
          cliSessionTransport: "acp" as const,
          model: event.model ?? activeChat.session.model
        };
        return {
          activeChat: { ...activeChat, session: nextSession },
          chats: state.chats.map((chat) => (chat.id === event.chatId ? nextSession : chat))
        };
      }

      if (event.type === "run_summary") {
        const nextSession = {
          ...activeChat.session,
          cliSessionId: event.sessionId ?? activeChat.session.cliSessionId,
          cliSessionTransport: event.sessionId ? ("acp" as const) : activeChat.session.cliSessionTransport,
          model: event.model ?? activeChat.session.model,
          usage: mergeUsageSnapshot(activeChat.session.usage, event.stats, event.createdAt)
        };
        return {
          activeChat: { ...activeChat, session: nextSession },
          chats: state.chats.map((chat) => (chat.id === event.chatId ? nextSession : chat))
        };
      }

      if (event.type === "completed") {
        let fallbackAssistantId = event.messageId;
        if (!fallbackAssistantId) {
          for (let i = activeChat.messages.length - 1; i >= 0; i--) {
            const m = activeChat.messages[i];
            if (m.role === "assistant" && m.status === "streaming") {
              fallbackAssistantId = m.id;
              break;
            }
          }
        }

        const messages = activeChat.messages.map((message) => {
          if (message.role === "assistant" && message.id === fallbackAssistantId) {
            return { ...message, status: "done" as const, durationMs: event.durationMs };
          }
          return message;
        });
        const activities = activeChat.activities.map((activity) => {
          if (activity.tone === "reasoning" && activity.status === "running" && (!fallbackAssistantId || activity.messageId === fallbackAssistantId)) {
            return { ...activity, status: "done" as const };
          }
          return activity;
        });
        return {
          activeChat: { ...activeChat, messages, activities },
          cliStatus: "connected",
          activeRunChatId: state.activeRunChatId === event.chatId ? null : state.activeRunChatId,
          cliHealth: state.cliHealth ? { ...state.cliHealth, status: "connected" } : state.cliHealth
        };
      }

      if (event.type === "error") {
        const authFailure = /sign in|login|authenticate|credential|oauth|unauthorized/i.test(event.message);
        let fallbackAssistantId = event.messageId;
        if (!fallbackAssistantId) {
          for (let i = activeChat.messages.length - 1; i >= 0; i--) {
            const m = activeChat.messages[i];
            if (m.role === "assistant" && m.status === "streaming") {
              fallbackAssistantId = m.id;
              break;
            }
          }
        }

        const messages = activeChat.messages.map((message) => {
          if (message.role === "assistant" && message.id === fallbackAssistantId) {
            return { ...message, status: "error" as const, content: message.content || event.message };
          }
          return message;
        });
        const activity: CliActivity = {
          id: `error_${Date.now()}`,
          chatId: event.chatId,
          kind: "error",
          title: "Gemini CLI error",
          body: event.message,
          status: "error",
          createdAt: event.createdAt
        };
        let nextActivities = [...activeChat.activities, activity];
        if (nextActivities.length > 200) {
          nextActivities = nextActivities.slice(-200);
        }

        return {
          activeChat: { ...activeChat, messages, activities: nextActivities },
          cliStatus: "error",
          activeRunChatId: state.activeRunChatId === event.chatId ? null : state.activeRunChatId,
          cliHealth: state.cliHealth
            ? {
                ...state.cliHealth,
                status: "error",
                authenticated: authFailure ? false : state.cliHealth.authenticated,
                message: event.message
              }
            : state.cliHealth,
          settings: authFailure && state.settings ? { ...state.settings, manualAuthConfirmed: false } : state.settings
        };
      }

      if (event.type === "status") {
        return {
          cliStatus: event.status,
          activeRunChatId: nextRunChatIdForStatus,
          cliHealth: state.cliHealth ? { ...state.cliHealth, status: event.status } : state.cliHealth
        };
      }

      return state;
      });
    } catch (error) {
      set({
        cliStatus: "error",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}));
