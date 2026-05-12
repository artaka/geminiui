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

interface MetadataData {
  settings: AppSettings;
  workspaces: Workspace[];
  chats: ChatSession[];
}

interface ChatData {
  messages: Message[];
  activities: CliActivity[];
}

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

export class JsonStore {
  private readonly baseDir: string;
  private readonly metadataPath: string;
  private readonly chatsDir: string;

  private metadata: MetadataData;
  private chatCache = new Map<string, ChatData>();
  private saveTimeouts = new Map<string, NodeJS.Timeout>();
  private metadataSaveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.baseDir = app.getPath("userData");
    this.metadataPath = path.join(this.baseDir, "metadata.json");
    this.chatsDir = path.join(this.baseDir, "chats");

    if (!fs.existsSync(this.chatsDir)) {
      fs.mkdirSync(this.chatsDir, { recursive: true });
    }

    this.metadata = this.init();
  }

  private init(): MetadataData {
    const legacyPath = path.join(this.baseDir, "app-state.json");
    if (fs.existsSync(legacyPath)) {
      return this.migrateLegacy(legacyPath);
    }

    if (fs.existsSync(this.metadataPath)) {
      try {
        const raw = fs.readFileSync(this.metadataPath, "utf8");
        const parsed = JSON.parse(raw) as Partial<MetadataData>;
        const defaultSettings = createDefaultSettings();
        return {
          settings: { ...defaultSettings, ...parsed.settings },
          workspaces: parsed.workspaces ?? [],
          chats: (parsed.chats ?? []).map((chat) => ({
            ...createDefaultChatFields({ ...defaultSettings, ...parsed.settings }),
            ...chat,
            usage: { ...createDefaultUsageSnapshot(), ...chat.usage }
          }))
        };
      } catch (e) {
        console.error("Failed to load metadata, starting fresh", e);
      }
    }

    const fresh: MetadataData = {
      settings: createDefaultSettings(),
      workspaces: [],
      chats: []
    };
    this.persistMetadata(fresh);
    return fresh;
  }

  private migrateLegacy(legacyPath: string): MetadataData {
    console.log("Migrating legacy app-state.json to new architecture...");
    try {
      const raw = fs.readFileSync(legacyPath, "utf8");
      const legacyData = JSON.parse(raw) as PersistedAppData;

      const metadata: MetadataData = {
        settings: legacyData.settings,
        workspaces: legacyData.workspaces,
        chats: legacyData.chats
      };

      // Split messages and activities into individual chat files
      const chatMap = new Map<string, ChatData>();
      for (const msg of legacyData.messages) {
        if (!chatMap.has(msg.chatId)) chatMap.set(msg.chatId, { messages: [], activities: [] });
        chatMap.get(msg.chatId)!.messages.push(msg);
      }
      for (const act of legacyData.activities) {
        if (!chatMap.has(act.chatId)) chatMap.set(act.chatId, { messages: [], activities: [] });
        chatMap.get(act.chatId)!.activities.push(act);
      }

      for (const [chatId, data] of chatMap.entries()) {
        const chatPath = path.join(this.chatsDir, `${chatId}.json`);
        // Cap activities at 200 during migration
        data.activities = data.activities.slice(-200);
        fs.writeFileSync(chatPath, JSON.stringify(data, null, 2), "utf8");
      }

      this.persistMetadata(metadata);

      // Backup and remove legacy file
      const backupPath = path.join(this.baseDir, "app-state.backup.json");
      fs.renameSync(legacyPath, backupPath);
      console.log("Migration complete.");
      return metadata;
    } catch (e) {
      console.error("Migration failed, starting fresh", e);
      return {
        settings: createDefaultSettings(),
        workspaces: [],
        chats: []
      };
    }
  }

  private persistMetadata(data: MetadataData): void {
    const tmpPath = `${this.metadataPath}.tmp`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
      fs.renameSync(tmpPath, this.metadataPath);
    } catch (e) {
      console.error("Failed to persist metadata", e);
    }
  }

  private async persistChat(chatId: string, data: ChatData): Promise<void> {
    const chatPath = path.join(this.chatsDir, `${chatId}.json`);
    const tmpPath = `${chatPath}.tmp`;
    try {
      // Ensure we only save the capped activities
      const cappedData: ChatData = {
        messages: data.messages,
        activities: data.activities.slice(-200)
      };
      await fs.promises.writeFile(tmpPath, JSON.stringify(cappedData, null, 2), "utf8");
      await fs.promises.rename(tmpPath, chatPath);
    } catch (e) {
      console.error(`Failed to persist chat ${chatId}`, e);
    }
  }

  private scheduleMetadataSave(): void {
    if (this.metadataSaveTimeout) return;
    this.metadataSaveTimeout = setTimeout(() => {
      this.persistMetadata(this.metadata);
      this.metadataSaveTimeout = null;
    }, 1000);
  }

  private scheduleChatSave(chatId: string): void {
    if (this.saveTimeouts.has(chatId)) return;
    this.saveTimeouts.set(chatId, setTimeout(async () => {
      const data = this.chatCache.get(chatId);
      if (data) {
        await this.persistChat(chatId, data);
      }
      this.saveTimeouts.delete(chatId);
    }, 1000));
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    this.metadata.settings = { ...this.metadata.settings, ...patch };
    this.scheduleMetadataSave();
    return this.metadata.settings;
  }

  getSettings(): AppSettings {
    return structuredClone(this.metadata.settings);
  }

  listWorkspaces(): Workspace[] {
    return structuredClone(this.metadata.workspaces);
  }

  saveWorkspace(workspace: Workspace): Workspace {
    const index = this.metadata.workspaces.findIndex((item) => item.id === workspace.id);
    if (index >= 0) {
      this.metadata.workspaces[index] = workspace;
    } else {
      this.metadata.workspaces.unshift(workspace);
    }
    this.scheduleMetadataSave();
    return workspace;
  }

  listChats(workspaceId: string): ChatSession[] {
    return this.metadata.chats
      .filter((item) => item.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((item) => ({ ...item }));
  }

  saveChat(chat: ChatSession): ChatSession {
    const index = this.metadata.chats.findIndex((item) => item.id === chat.id);
    const normalizedChat: ChatSession = {
      ...createDefaultChatFields(this.metadata.settings),
      ...chat,
      usage: { ...createDefaultUsageSnapshot(), ...chat.usage }
    };
    if (index >= 0) {
      this.metadata.chats[index] = normalizedChat;
    } else {
      this.metadata.chats.unshift(normalizedChat);
    }
    this.scheduleMetadataSave();
    return normalizedChat;
  }

  getChatPayload(chatId: string) {
    const session = this.metadata.chats.find((item) => item.id === chatId);
    if (!session) return null;

    let chatData = this.chatCache.get(chatId);
    if (!chatData) {
      const chatPath = path.join(this.chatsDir, `${chatId}.json`);
      if (fs.existsSync(chatPath)) {
        try {
          const raw = fs.readFileSync(chatPath, "utf8");
          chatData = JSON.parse(raw) as ChatData;
          this.chatCache.set(chatId, chatData);
        } catch (e) {
          console.error(`Failed to load chat ${chatId}`, e);
          chatData = { messages: [], activities: [] };
        }
      } else {
        chatData = { messages: [], activities: [] };
        this.chatCache.set(chatId, chatData);
      }
    }

    return {
      session: structuredClone(session),
      messages: structuredClone(chatData.messages),
      activities: structuredClone(chatData.activities)
    };
  }

  deleteChat(chatId: string): void {
    this.metadata.chats = this.metadata.chats.filter((item) => item.id !== chatId);
    if (this.metadata.settings.activeChatId === chatId) {
      this.metadata.settings.activeChatId = undefined;
    }
    this.scheduleMetadataSave();

    this.chatCache.delete(chatId);
    if (this.saveTimeouts.has(chatId)) {
      clearTimeout(this.saveTimeouts.get(chatId)!);
      this.saveTimeouts.delete(chatId);
    }

    const chatPath = path.join(this.chatsDir, `${chatId}.json`);
    if (fs.existsSync(chatPath)) {
      fs.unlinkSync(chatPath);
    }
  }

  private ensureChatInMemory(chatId: string): ChatData {
    let data = this.chatCache.get(chatId);
    if (!data) {
      const payload = this.getChatPayload(chatId);
      data = payload ? { messages: payload.messages, activities: payload.activities } : { messages: [], activities: [] };
      this.chatCache.set(chatId, data);
    }
    return data;
  }

  saveMessage(message: Message): Message {
    const data = this.ensureChatInMemory(message.chatId);
    const index = data.messages.findIndex((item) => item.id === message.id);
    if (index >= 0) {
      data.messages[index] = message;
    } else {
      data.messages.push(message);
    }
    this.scheduleChatSave(message.chatId);
    return message;
  }

  saveActivity(activity: CliActivity): CliActivity {
    const data = this.ensureChatInMemory(activity.chatId);
    const index = data.activities.findIndex((item) => item.id === activity.id);
    if (index >= 0) {
      data.activities[index] = activity;
    } else {
      data.activities.push(activity);
    }
    // Cap in memory too
    if (data.activities.length > 300) { // Slightly higher threshold for in-memory to avoid constant slicing
       data.activities = data.activities.slice(-200);
    }
    this.scheduleChatSave(activity.chatId);
    return activity;
  }

  appendAssistantToken(chatId: string, token: string, messageId?: string): Message | null {
    const data = this.ensureChatInMemory(chatId);
    if (messageId) {
      const index = data.messages.findIndex((item) => item.id === messageId && item.role === "assistant");
      if (index >= 0) {
        const message = data.messages[index];
        const next = { ...message, content: message.content + token, status: "streaming" as const };
        data.messages[index] = next;
        this.scheduleChatSave(chatId);
        return next;
      }
    }

    for (let index = data.messages.length - 1; index >= 0; index -= 1) {
      const message = data.messages[index];
      if (message.role === "assistant" && message.status === "streaming") {
        const next = { ...message, content: message.content + token };
        data.messages[index] = next;
        this.scheduleChatSave(chatId);
        return next;
      }
    }
    return null;
  }

  finalizeAssistant(chatId: string, messageId?: string, durationMs?: number): Message | null {
    const data = this.ensureChatInMemory(chatId);
    const update = (message: Message): Message => {
      const status = message.status === "error" ? "error" : ("done" as const);
      return { ...message, status, durationMs };
    };

    if (messageId) {
      const index = data.messages.findIndex((item) => item.id === messageId && item.role === "assistant");
      if (index >= 0) {
        const next = update(data.messages[index]);
        data.messages[index] = next;
        this.scheduleChatSave(chatId);
        return next;
      }
    }

    for (let index = data.messages.length - 1; index >= 0; index -= 1) {
      const message = data.messages[index];
      if (message.role === "assistant" && (message.status === "streaming" || message.status === "error")) {
        const next = update(message);
        data.messages[index] = next;
        this.scheduleChatSave(chatId);
        return next;
      }
    }
    return null;
  }

  failAssistant(chatId: string, errorText: string, messageId?: string, durationMs?: number): Message | null {
    const data = this.ensureChatInMemory(chatId);
    if (messageId) {
      const index = data.messages.findIndex((item) => item.id === messageId && item.role === "assistant");
      if (index >= 0) {
        const next = { ...data.messages[index], status: "error" as const, content: data.messages[index].content || errorText, durationMs };
        data.messages[index] = next;
        this.scheduleChatSave(chatId);
        return next;
      }
    }

    for (let index = data.messages.length - 1; index >= 0; index -= 1) {
      const message = data.messages[index];
      if (message.role === "assistant" && message.status === "streaming") {
        const next = { ...message, status: "error" as const, content: message.content || errorText, durationMs };
        data.messages[index] = next;
        this.scheduleChatSave(chatId);
        return next;
      }
    }
    return null;
  }
}
