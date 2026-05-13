import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import {
  AppSettings,
  ChatSession,
  ChatSessionPayload,
  CliEvent,
  CliHealth,
  CliStatus,
  DiagnosticsSnapshot,
  EnvironmentStatus,
  Message,
  RuntimeModelOption,
  Workspace
} from "../shared/types";

type Unsubscribe = () => void;

const api = {
  settings: {
    get: () => ipcRenderer.invoke("settings:get") as Promise<AppSettings>,
    update: (patch: Partial<AppSettings>) => ipcRenderer.invoke("settings:update", patch) as Promise<AppSettings>
  },
  projects: {
    list: () => ipcRenderer.invoke("projects:list") as Promise<Workspace[]>,
    add: () => ipcRenderer.invoke("projects:add") as Promise<Workspace | null>,
    setActive: (workspaceId: string) => ipcRenderer.invoke("projects:setActive", workspaceId) as Promise<void>
  },
  chat: {
    list: (workspaceId: string) => ipcRenderer.invoke("chat:list", workspaceId),
    create: (workspaceId: string) => ipcRenderer.invoke("chat:create", workspaceId),
    open: (chatId: string) => ipcRenderer.invoke("chat:open", chatId) as Promise<ChatSessionPayload | null>,
    delete: (chatId: string) => ipcRenderer.invoke("chat:delete", chatId) as Promise<void>,
    update: (chatId: string, patch: Partial<ChatSession>) => ipcRenderer.invoke("chat:update", { chatId, patch }) as Promise<ChatSession>,
    search: (query: string, workspaceId?: string) => ipcRenderer.invoke("chat:search", { query, workspaceId }) as Promise<Array<{ chat: ChatSession; message?: Message }>>,
    send: (chatId: string, prompt: string, assumeAuthenticated?: boolean, userMessageId?: string, assistantMessageId?: string) =>
      ipcRenderer.invoke("chat:send", { chatId, prompt, assumeAuthenticated, userMessageId, assistantMessageId }) as Promise<{
        userMessage: Message;
        assistantMessage: Message;
      }>,
    stop: (chatId: string) => ipcRenderer.invoke("chat:stop", chatId) as Promise<void>,
    revertChangeSet: (chatId: string, changeSetId: string, relativePath?: string) =>
      ipcRenderer.invoke("chat:revertChangeSet", { chatId, changeSetId, relativePath }) as Promise<ChatSessionPayload>,
    openPath: (filePath: string) => ipcRenderer.invoke("chat:openPath", filePath) as Promise<void>
  },
  cli: {
    getStatus: () => ipcRenderer.invoke("cli:getStatus") as Promise<CliStatus>,
    recheck: () => ipcRenderer.invoke("cli:recheck") as Promise<CliHealth>,
    openLogin: () => ipcRenderer.invoke("cli:openLogin") as Promise<void>,
    install: () => ipcRenderer.invoke("cli:install") as Promise<void>,
    onEvent: (listener: (event: CliEvent) => void): Unsubscribe => {
      const wrapped = (_event: IpcRendererEvent, payload: CliEvent) => listener(payload);
      ipcRenderer.on("cli:event", wrapped);
      return () => ipcRenderer.removeListener("cli:event", wrapped);
    }
  },
  environment: {
    getStatus: () => ipcRenderer.invoke("environment:getStatus") as Promise<EnvironmentStatus>,
    setupSandbox: () => ipcRenderer.invoke("environment:setupSandbox") as Promise<void>
  },
  diagnostics: {
    getSnapshot: () => ipcRenderer.invoke("diagnostics:getSnapshot") as Promise<DiagnosticsSnapshot>,
    exportLogs: () => ipcRenderer.invoke("diagnostics:exportLogs") as Promise<string>
  },
  bootstrap: {
    load: () => ipcRenderer.invoke("bootstrap:load")
  },
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize") as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize") as Promise<boolean>,
    close: () => ipcRenderer.invoke("window:close") as Promise<void>,
    isMaximized: () => ipcRenderer.invoke("window:isMaximized") as Promise<boolean>,
    onMaximizedChanged: (listener: (isMaximized: boolean) => void): Unsubscribe => {
      const wrapped = (_event: IpcRendererEvent, value: boolean) => listener(value);
      ipcRenderer.on("window:maximizedChanged", wrapped);
      return () => ipcRenderer.removeListener("window:maximizedChanged", wrapped);
    }
  }
};

contextBridge.exposeInMainWorld("gemini", api);

declare global {
  interface Window {
    gemini: typeof api;
  }
}
