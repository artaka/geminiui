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
  RuntimeModelOption,
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
  cliHealth: CliHealth;
  environment: EnvironmentStatus;
  models: RuntimeModelOption[];
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
  cliHealth: CliHealth | null;
  environment: EnvironmentStatus | null;
  models: RuntimeModelOption[];
  diagnostics: DiagnosticsSnapshot | null;
  activeScreen: "chat" | "settings";
  bootstrap(): Promise<void>;
  addWorkspace(): Promise<void>;
  selectWorkspace(workspaceId: string): Promise<void>;
  createChat(): Promise<void>;
  openChat(chatId: string): Promise<void>;
  updateChat(chatId: string, patch: Partial<ChatSession>): Promise<void>;
  sendPrompt(prompt: string): Promise<void>;
  stopPrompt(): Promise<void>;
  loadDiagnostics(): Promise<void>;
  exportLogs(): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  recheckCli(): Promise<void>;
  confirmCliAuth(): Promise<void>;
  openCliLogin(): Promise<void>;
  installCli(): Promise<void>;
  setScreen(screen: "chat" | "settings"): void;
  applyCliEvent(event: CliEvent): void;
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
  cliHealth: null,
  environment: null,
  models: [],
  diagnostics: null,
  activeScreen: "chat",

  async bootstrap() {
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
        cliHealth: payload.cliHealth,
        environment: payload.environment,
        models: payload.models
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
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
    const activeChat = await window.gemini.chat.open(chatId);
    if (activeChat) {
      set({ activeChat });
    }
  },

  async updateChat(chatId, patch) {
    const updatedChat = await window.gemini.chat.update(chatId, patch);
    set((state) => ({
      chats: state.chats.map((chat) => (chat.id === chatId ? updatedChat : chat)),
      activeChat: state.activeChat && state.activeChat.session.id === chatId ? { ...state.activeChat, session: updatedChat } : state.activeChat
    }));
  },

  async sendPrompt(prompt: string) {
    const activeChat = get().activeChat;
    if (!activeChat) {
      return;
    }

    const userMessage: Message = {
      id: `pending_user_${Date.now()}`,
      chatId: activeChat.session.id,
      role: "user",
      content: prompt,
      status: "done",
      createdAt: new Date().toISOString()
    };
    const assistantMessage: Message = {
      id: `pending_assistant_${Date.now()}`,
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
      cliStatus: "starting"
    });

    const result = (await window.gemini.chat.send(
      activeChat.session.id,
      prompt,
      get().settings?.manualAuthConfirmed
    )) as {
      userMessage: Message;
      assistantMessage: Message;
    };

    set((state) => {
      if (!state.activeChat || state.activeChat.session.id !== activeChat.session.id) {
        return state;
      }
      const messages = [...state.activeChat.messages];
      messages[messages.length - 2] = result.userMessage;
      messages[messages.length - 1] = result.assistantMessage;
      return {
        activeChat: {
          ...state.activeChat,
          messages
        }
      };
    });

    const workspace = get().activeWorkspace;
    if (workspace) {
      const chats = await window.gemini.chat.list(workspace.id);
      const refreshedActiveChat = await window.gemini.chat.open(activeChat.session.id);
      set({ chats, activeChat: refreshedActiveChat ?? get().activeChat });
    }
  },

  async stopPrompt() {
    const activeChat = get().activeChat;
    if (!activeChat) {
      return;
    }
    await window.gemini.chat.stop(activeChat.session.id);
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

  setScreen(screen) {
    set({ activeScreen: screen });
  },

  applyCliEvent(event) {
    set((state) => {
      const activeChat = state.activeChat;
      if (!activeChat || activeChat.session.id !== event.chatId) {
        return {
          cliStatus: event.type === "status" ? event.status : state.cliStatus,
          cliHealth: event.type === "status" && state.cliHealth ? { ...state.cliHealth, status: event.status } : state.cliHealth
        };
      }

      if (event.type === "assistant_token") {
        const messages = [...activeChat.messages];
        const assistantIndex = [...messages].reverse().findIndex((item) => item.role === "assistant" && item.status === "streaming");
        if (assistantIndex >= 0) {
          const index = messages.length - 1 - assistantIndex;
          messages[index] = {
            ...messages[index],
            content: messages[index].content + event.token
          };
        }
        return {
          activeChat: { ...activeChat, messages },
          cliStatus: "streaming"
        };
      }

      if (event.type === "activity") {
        return {
          activeChat: {
            ...activeChat,
            activities: [...activeChat.activities, event.activity]
          }
        };
      }

      if (event.type === "session_initialized") {
        const nextSession = {
          ...activeChat.session,
          cliSessionId: event.sessionId,
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
          model: event.model ?? activeChat.session.model,
          usage: {
            ...activeChat.session.usage,
            requestCount: activeChat.session.usage.requestCount + 1,
            lastUpdatedAt: event.createdAt
          }
        };
        return {
          activeChat: { ...activeChat, session: nextSession },
          chats: state.chats.map((chat) => (chat.id === event.chatId ? nextSession : chat))
        };
      }

      if (event.type === "completed") {
        const messages = activeChat.messages.map((message, index, all) => {
          if (index === all.length - 1 && message.role === "assistant" && message.status === "streaming") {
            return { ...message, status: "done" as const };
          }
          return message;
        });
        return {
          activeChat: { ...activeChat, messages },
          cliStatus: "connected",
          cliHealth: state.cliHealth ? { ...state.cliHealth, status: "connected" } : state.cliHealth
        };
      }

      if (event.type === "error") {
        const authFailure = /sign in|login|authenticate|credential|oauth|unauthorized/i.test(event.message);
        const messages = activeChat.messages.map((message, index, all) => {
          if (index === all.length - 1 && message.role === "assistant" && message.status === "streaming") {
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
        return {
          activeChat: { ...activeChat, messages, activities: [...activeChat.activities, activity] },
          cliStatus: "error",
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
          cliHealth: state.cliHealth ? { ...state.cliHealth, status: event.status } : state.cliHealth
        };
      }

      return state;
    });
  }
}));
