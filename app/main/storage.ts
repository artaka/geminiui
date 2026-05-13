import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import {
  ApprovalMode,
  AppSettings,
  ChatSession,
  ChatUsageSnapshot,
  CliActivity,
  FileChangeEntry,
  FileChangeKind,
  FileChangeSet,
  FileChangeSetState,
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
  changeSets: FileChangeSet[];
}

interface StoredFileSnapshot {
  path: string;
  relativePath: string;
  existedBefore: boolean;
  existsAfter: boolean;
  beforeContentBase64?: string;
  afterContentBase64?: string;
  kind: FileChangeKind;
  additions: number;
  deletions: number;
  diffPreview: string;
  revertedAt?: string;
}

interface StoredChangeSetManifest {
  id: string;
  chatId: string;
  messageId: string;
  workspacePath: string;
  createdAt: string;
  files: StoredFileSnapshot[];
}

interface PendingChangeSet {
  summary: FileChangeSet;
  manifest: StoredChangeSetManifest;
}

interface EmbeddedDiffPayload {
  path?: string;
  oldText?: string;
  newText?: string;
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
    preferredSandbox: false,
    preferredSandboxMode: "off"
  };
}

function normalizeSettings(settings?: Partial<AppSettings>): AppSettings {
  const normalized = { ...createDefaultSettings(), ...settings };
  if (normalized.preferredSandbox && normalized.preferredSandboxMode === "auto") {
    normalized.preferredSandbox = false;
    normalized.preferredSandboxMode = "off";
  }
  return normalized;
}

export class JsonStore {
  private readonly baseDir: string;
  private readonly metadataPath: string;
  private readonly chatsDir: string;
  private readonly changeSetsDir: string;

  private metadata: MetadataData;
  private chatCache = new Map<string, ChatData>();
  private saveTimeouts = new Map<string, NodeJS.Timeout>();
  private metadataSaveTimeout: NodeJS.Timeout | null = null;
  private pendingChangeSets = new Map<string, PendingChangeSet>();

  constructor() {
    this.baseDir = app.getPath("userData");
    this.metadataPath = path.join(this.baseDir, "metadata.json");
    this.chatsDir = path.join(this.baseDir, "chats");
    this.changeSetsDir = path.join(this.baseDir, "change-sets");

    if (!fs.existsSync(this.chatsDir)) {
      fs.mkdirSync(this.chatsDir, { recursive: true });
    }
    if (!fs.existsSync(this.changeSetsDir)) {
      fs.mkdirSync(this.changeSetsDir, { recursive: true });
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
        const settings = normalizeSettings(parsed.settings);
        return {
          settings,
          workspaces: parsed.workspaces ?? [],
          chats: (parsed.chats ?? []).map((chat) => ({
            ...createDefaultChatFields(settings),
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
        settings: normalizeSettings(legacyData.settings),
        workspaces: legacyData.workspaces,
        chats: legacyData.chats
      };

      // Split messages and activities into individual chat files
      const chatMap = new Map<string, ChatData>();
      for (const msg of legacyData.messages) {
        if (!chatMap.has(msg.chatId)) chatMap.set(msg.chatId, { messages: [], activities: [], changeSets: [] });
        chatMap.get(msg.chatId)!.messages.push(msg);
      }
      for (const act of legacyData.activities) {
        if (!chatMap.has(act.chatId)) chatMap.set(act.chatId, { messages: [], activities: [], changeSets: [] });
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
        activities: data.activities.slice(-200),
        changeSets: data.changeSets
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

  private getChangeSetKey(chatId: string, messageId: string): string {
    return `${chatId}:${messageId}`;
  }

  private getChangeSetDir(changeSetId: string): string {
    return path.join(this.changeSetsDir, changeSetId);
  }

  private getManifestPath(changeSetId: string): string {
    return path.join(this.getChangeSetDir(changeSetId), "manifest.json");
  }

  private persistManifest(manifest: StoredChangeSetManifest): void {
    const manifestPath = this.getManifestPath(manifest.id);
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${manifestPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
    fs.renameSync(tmpPath, manifestPath);
  }

  private getWorkspacePathForChat(chatId: string): string | null {
    const session = this.metadata.chats.find((item) => item.id === chatId);
    if (!session) {
      return null;
    }
    return this.metadata.workspaces.find((item) => item.id === session.workspaceId)?.path ?? null;
  }

  private toBase64(buffer: Buffer | null): string | undefined {
    return buffer ? buffer.toString("base64") : undefined;
  }

  private fromBase64(value?: string): Buffer | null {
    return value ? Buffer.from(value, "base64") : null;
  }

  private normalizeTextForComparison(buffer: Buffer | null): string | null {
    if (!buffer) {
      return null;
    }

    return buffer
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n");
  }

  private computeDiffPreview(beforeText: string, afterText: string): { additions: number; deletions: number; preview: string } {
    const beforeLines = beforeText.split(/\r?\n/);
    const afterLines = afterText.split(/\r?\n/);
    const maxCells = 200_000;

    if (beforeLines.length * afterLines.length > maxCells) {
      return {
        additions: Math.max(0, afterLines.length - beforeLines.length),
        deletions: Math.max(0, beforeLines.length - afterLines.length),
        preview: beforeText === afterText ? "" : `${beforeText ? `- ${beforeLines[0] ?? ""}` : ""}\n${afterText ? `+ ${afterLines[0] ?? ""}` : ""}`.trim()
      };
    }

    const dp: number[][] = Array.from({ length: beforeLines.length + 1 }, () => Array<number>(afterLines.length + 1).fill(0));
    for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
      for (let j = afterLines.length - 1; j >= 0; j -= 1) {
        dp[i][j] =
          beforeLines[i] === afterLines[j]
            ? dp[i + 1][j + 1] + 1
            : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const previewLines: string[] = [];
    let additions = 0;
    let deletions = 0;
    let i = 0;
    let j = 0;

    while (i < beforeLines.length && j < afterLines.length) {
      if (beforeLines[i] === afterLines[j]) {
        previewLines.push(` ${beforeLines[i]}`);
        i += 1;
        j += 1;
        continue;
      }

      if (dp[i + 1][j] >= dp[i][j + 1]) {
        previewLines.push(`-${beforeLines[i]}`);
        deletions += 1;
        i += 1;
      } else {
        previewLines.push(`+${afterLines[j]}`);
        additions += 1;
        j += 1;
      }
    }

    while (i < beforeLines.length) {
      previewLines.push(`-${beforeLines[i]}`);
      deletions += 1;
      i += 1;
    }
    while (j < afterLines.length) {
      previewLines.push(`+${afterLines[j]}`);
      additions += 1;
      j += 1;
    }

    return {
      additions,
      deletions,
      preview: previewLines.slice(0, 220).join("\n")
    };
  }

  private createFileChangeEntry(snapshot: StoredFileSnapshot): FileChangeEntry {
    return {
      path: snapshot.path,
      relativePath: snapshot.relativePath,
      kind: snapshot.kind,
      state: snapshot.revertedAt ? "reverted" : "active",
      additions: snapshot.additions,
      deletions: snapshot.deletions,
      diffPreview: snapshot.diffPreview,
      revertedAt: snapshot.revertedAt
    };
  }

  private summarizeManifest(manifest: StoredChangeSetManifest): FileChangeSet {
    const files = manifest.files.map((snapshot) => this.createFileChangeEntry(snapshot));
    const activeFiles = files.filter((file) => file.state === "active");
    const revertedFiles = files.filter((file) => file.state === "reverted");
    const status: FileChangeSetState =
      activeFiles.length === 0 ? "reverted" : revertedFiles.length > 0 ? "partial" : "ready";

    return {
      id: manifest.id,
      chatId: manifest.chatId,
      messageId: manifest.messageId,
      workspacePath: manifest.workspacePath,
      createdAt: manifest.createdAt,
      status,
      totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
      totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
      fileCount: files.length,
      files
    };
  }

  private readFileBuffer(filePath: string): Buffer | null {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  }

  private extractCommandText(activity: CliActivity): string {
    const source = activity.details || activity.body || "";
    const markerIndex = source.indexOf("\nkind:");
    return (markerIndex >= 0 ? source.slice(0, markerIndex) : source).trim();
  }

  private resolveTrackedPath(workspacePath: string, candidatePath: string): string | null {
    const workspaceRoot = path.resolve(workspacePath);
    const resolvedPath = path.resolve(path.isAbsolute(candidatePath) ? candidatePath : path.join(workspaceRoot, candidatePath));
    const relativePath = path.relative(workspaceRoot, resolvedPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return null;
    }
    return resolvedPath;
  }

  private splitShellPathList(value: string): string[] {
    return value
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  private addResolvedMutationPath(paths: string[], workspacePath: string, candidatePath: string): void {
    const resolved = this.resolveTrackedPath(workspacePath, candidatePath);
    if (resolved && !paths.includes(resolved)) {
      paths.push(resolved);
    }
  }

  private extractShellMutationPaths(commandText: string, workspacePath: string): string[] {
    if (!commandText) {
      return [];
    }

    const patterns: RegExp[] = [];
    if (/\b(?:Out-File|Set-Content|Add-Content)\b/i.test(commandText)) {
      patterns.push(/-(?:FilePath|Path)\s+(.+?)(?:\s+-\w+|$)/gi);
    }
    if (/\bNew-Item\b/i.test(commandText) && /\b-ItemType\s+["']?File["']?\b/i.test(commandText)) {
      patterns.push(/\bNew-Item\b[\s\S]*?-Path\s+(.+?)(?:\s+-\w+|$)/gi);
    }
    if (/\b(?:Remove-Item|rm|del|erase)\b/i.test(commandText)) {
      patterns.push(/(?:Remove-Item|rm|del|erase)\s+(.+?)(?:\s+-\w+|$)/gi);
      patterns.push(/-(?:LiteralPath|Path)\s+(.+?)(?:\s+-\w+|$)/gi);
    }
    patterns.push(/(?:^|[\s;])>>?\s*["']?([^"'\r\n;|<>]+)["']?/gi);

    const resolvedPaths: string[] = [];
    for (const pattern of patterns) {
      for (const match of commandText.matchAll(pattern)) {
        const targetPaths = match[1] ? this.splitShellPathList(match[1]) : [];
        for (const targetPath of targetPaths) {
          this.addResolvedMutationPath(resolvedPaths, workspacePath, targetPath);
        }
      }
    }

    return resolvedPaths;
  }

  private getTrackedMutationPaths(activity: CliActivity, workspacePath: string): string[] {
    if (activity.tone === "write" || activity.tone === "edit") {
      const resolved = activity.target ? this.resolveTrackedPath(workspacePath, activity.target) : null;
      return resolved ? [resolved] : [];
    }

    if (activity.tone === "execute") {
      return this.extractShellMutationPaths(this.extractCommandText(activity), workspacePath);
    }

    return [];
  }

  private extractEmbeddedDiff(activity: CliActivity): EmbeddedDiffPayload | null {
    const source = activity.details || activity.body;
    if (!source) {
      return null;
    }

    const diffMarker = source.indexOf('{\n  "type": "diff"');
    if (diffMarker < 0) {
      return null;
    }

    try {
      const parsed = JSON.parse(source.slice(diffMarker).trim()) as Record<string, unknown>;
      if (parsed.type !== "diff") {
        return null;
      }

      return {
        path: typeof parsed.path === "string" ? parsed.path : undefined,
        oldText: typeof parsed.oldText === "string" ? parsed.oldText : undefined,
        newText: typeof parsed.newText === "string" ? parsed.newText : undefined
      };
    } catch {
      return null;
    }
  }

  private ensurePendingChangeSet(chatId: string, messageId: string): PendingChangeSet | null {
    const key = this.getChangeSetKey(chatId, messageId);
    const existing = this.pendingChangeSets.get(key);
    if (existing) {
      return existing;
    }

    const workspacePath = this.getWorkspacePathForChat(chatId);
    if (!workspacePath) {
      return null;
    }

    const changeSetId = `changeset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const manifest: StoredChangeSetManifest = {
      id: changeSetId,
      chatId,
      messageId,
      workspacePath,
      createdAt: new Date().toISOString(),
      files: []
    };
    const pending: PendingChangeSet = {
      manifest,
      summary: this.summarizeManifest(manifest)
    };
    this.pendingChangeSets.set(key, pending);
    this.persistManifest(manifest);
    return pending;
  }

  trackMutationActivity(activity: CliActivity): void {
    if (!activity.messageId || activity.status === "error") {
      return;
    }

    const workspacePath = this.getWorkspacePathForChat(activity.chatId);
    if (!workspacePath) {
      return;
    }

    const absolutePaths = this.getTrackedMutationPaths(activity, workspacePath);
    if (absolutePaths.length === 0) {
      return;
    }
    const embeddedDiff = this.extractEmbeddedDiff(activity);

    const pending = this.ensurePendingChangeSet(activity.chatId, activity.messageId);
    if (!pending) {
      return;
    }

    for (const absolutePath of absolutePaths) {
      const relativePath = path.relative(pending.manifest.workspacePath, absolutePath) || path.basename(absolutePath);
      const embeddedDiffPath = embeddedDiff?.path ? this.resolveTrackedPath(pending.manifest.workspacePath, embeddedDiff.path) : null;
      const embeddedDiffMatches = Boolean(embeddedDiff && (!embeddedDiff.path || embeddedDiffPath === absolutePath));
      let snapshot = pending.manifest.files.find((item) => item.path === absolutePath);

      if (!snapshot) {
        const beforeBuffer = embeddedDiffMatches && embeddedDiff?.oldText !== undefined
          ? Buffer.from(embeddedDiff.oldText, "utf8")
          : this.readFileBuffer(absolutePath);
        snapshot = {
          path: absolutePath,
          relativePath,
          existedBefore: beforeBuffer !== null,
          existsAfter: beforeBuffer !== null,
          beforeContentBase64: this.toBase64(beforeBuffer),
          kind: beforeBuffer ? "modified" : "created",
          additions: 0,
          deletions: 0,
          diffPreview: ""
        };
        pending.manifest.files.push(snapshot);
      }

      if (activity.status === "done") {
        const afterBuffer = embeddedDiffMatches && embeddedDiff?.newText !== undefined
          ? Buffer.from(embeddedDiff.newText, "utf8")
          : this.readFileBuffer(absolutePath);
        snapshot.existsAfter = afterBuffer !== null;
        snapshot.afterContentBase64 = this.toBase64(afterBuffer);
        snapshot.kind = !snapshot.existedBefore && afterBuffer ? "created" : snapshot.existedBefore && !afterBuffer ? "deleted" : "modified";
        const beforeText = snapshot.beforeContentBase64 ? Buffer.from(snapshot.beforeContentBase64, "base64").toString("utf8") : "";
        const afterText = afterBuffer ? afterBuffer.toString("utf8") : "";
        const diff = this.computeDiffPreview(beforeText, afterText);
        snapshot.additions = diff.additions;
        snapshot.deletions = diff.deletions;
        snapshot.diffPreview = diff.preview;
      }
    }

    this.persistManifest(pending.manifest);
    pending.summary = this.summarizeManifest(pending.manifest);
  }

  finalizeChangeSet(chatId: string, messageId?: string): void {
    if (!messageId) {
      return;
    }

    const key = this.getChangeSetKey(chatId, messageId);
    const pending = this.pendingChangeSets.get(key);
    if (!pending) {
      return;
    }

    pending.manifest.files = pending.manifest.files.filter((file) => file.existedBefore || file.existsAfter);
    pending.summary = this.summarizeManifest(pending.manifest);
    if (pending.summary.fileCount === 0) {
      this.pendingChangeSets.delete(key);
      return;
    }

    const data = this.ensureChatInMemory(chatId);
    const existingIndex = data.changeSets.findIndex((item) => item.id === pending.summary.id);
    if (existingIndex >= 0) {
      data.changeSets[existingIndex] = pending.summary;
    } else {
      data.changeSets.push(pending.summary);
    }

    const messageIndex = data.messages.findIndex((item) => item.id === messageId && item.role === "assistant");
    if (messageIndex >= 0) {
      data.messages[messageIndex] = {
        ...data.messages[messageIndex],
        changeSetId: pending.summary.id
      };
    }

    this.scheduleChatSave(chatId);
    this.pendingChangeSets.delete(key);
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

  deleteWorkspace(workspaceId: string): void {
    const chatIds = this.metadata.chats.filter((item) => item.workspaceId === workspaceId).map((item) => item.id);
    for (const chatId of chatIds) {
      this.deleteChat(chatId);
    }

    this.metadata.workspaces = this.metadata.workspaces.filter((item) => item.id !== workspaceId);
    if (this.metadata.settings.activeWorkspaceId === workspaceId) {
      this.metadata.settings.activeWorkspaceId = this.metadata.workspaces[0]?.id;
      this.metadata.settings.activeChatId = undefined;
    }
    this.scheduleMetadataSave();
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

  searchChats(query: string, workspaceId?: string): Array<{ chat: ChatSession; message?: Message }> {
    const term = query.toLowerCase().trim();
    if (!term) return [];

    const results: Array<{ chat: ChatSession; message?: Message }> = [];
    const chatsToSearch = workspaceId 
      ? this.metadata.chats.filter(c => c.workspaceId === workspaceId)
      : this.metadata.chats;

    for (const chat of chatsToSearch) {
      if (chat.title.toLowerCase().includes(term)) {
        results.push({ chat: structuredClone(chat) });
        continue;
      }

      const payload = this.getChatPayload(chat.id);
      if (payload) {
        const matchingMessage = payload.messages.find(m => m.content.toLowerCase().includes(term));
        if (matchingMessage) {
          results.push({ chat: structuredClone(chat), message: structuredClone(matchingMessage) });
        }
      }
    }

    return results;
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
          const parsed = JSON.parse(raw) as Partial<ChatData>;
          chatData = {
            messages: parsed.messages ?? [],
            activities: parsed.activities ?? [],
            changeSets: parsed.changeSets ?? []
          };
          this.chatCache.set(chatId, chatData);
        } catch (e) {
          console.error(`Failed to load chat ${chatId}`, e);
          chatData = { messages: [], activities: [], changeSets: [] };
        }
      } else {
        chatData = { messages: [], activities: [], changeSets: [] };
        this.chatCache.set(chatId, chatData);
      }
    }

    return {
      session: structuredClone(session),
      messages: structuredClone(chatData.messages),
      activities: structuredClone(chatData.activities),
      changeSets: structuredClone(chatData.changeSets)
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
      data = payload ? { messages: payload.messages, activities: payload.activities, changeSets: payload.changeSets } : { messages: [], activities: [], changeSets: [] };
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
    const index = data.activities.findIndex((item) => item.id === activity.id && item.messageId === activity.messageId);
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

  finalizeActivities(chatId: string, messageId?: string): void {
    const data = this.ensureChatInMemory(chatId);
    let changed = false;

    data.activities = data.activities.map((activity) => {
      const matchesMessage = !messageId || activity.messageId === messageId;
      if (matchesMessage && activity.tone === "reasoning" && activity.status === "running") {
        changed = true;
        return { ...activity, status: "done" as const };
      }
      return activity;
    });

    if (changed) {
      this.scheduleChatSave(chatId);
    }
  }

  revertChangeSet(chatId: string, changeSetId: string, relativePath?: string) {
    const manifestPath = this.getManifestPath(changeSetId);
    if (!fs.existsSync(manifestPath)) {
      throw new Error("Rollback snapshot was not found.");
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as StoredChangeSetManifest;
    if (manifest.chatId !== chatId) {
      throw new Error("Rollback snapshot does not belong to this chat.");
    }

    const selectedFiles = relativePath
      ? manifest.files.filter((file) => file.relativePath === relativePath)
      : manifest.files.filter((file) => !file.revertedAt);

    if (selectedFiles.length === 0) {
      throw new Error("There are no matching file changes to revert.");
    }

    for (const file of selectedFiles) {
      const currentBuffer = this.readFileBuffer(file.path);
      const currentBase64 = this.toBase64(currentBuffer);
      const normalizedCurrent = this.normalizeTextForComparison(currentBuffer);
      const normalizedAfter = this.normalizeTextForComparison(this.fromBase64(file.afterContentBase64));
      const exactMatch = (currentBuffer !== null) === file.existsAfter && currentBase64 === file.afterContentBase64;
      const equivalentTextMatch = (currentBuffer !== null) === file.existsAfter && normalizedCurrent === normalizedAfter;
      if (!exactMatch && !equivalentTextMatch) {
        throw new Error(`Cannot revert ${file.relativePath} because it changed after the agent edit. Refresh the chat and inspect the file first.`);
      }
    }

    for (const file of selectedFiles) {
      if (file.existedBefore) {
        const beforeBuffer = this.fromBase64(file.beforeContentBase64);
        if (!beforeBuffer) {
          throw new Error(`Rollback data for ${file.relativePath} is corrupted.`);
        }
        fs.mkdirSync(path.dirname(file.path), { recursive: true });
        const tmpPath = `${file.path}.geminiapp-restore.tmp`;
        fs.writeFileSync(tmpPath, beforeBuffer);
        fs.renameSync(tmpPath, file.path);
      } else if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      file.revertedAt = new Date().toISOString();
    }

    this.persistManifest(manifest);

    const data = this.ensureChatInMemory(chatId);
    const changeSetIndex = data.changeSets.findIndex((item) => item.id === changeSetId);
    if (changeSetIndex >= 0) {
      data.changeSets[changeSetIndex] = this.summarizeManifest(manifest);
    }
    this.scheduleChatSave(chatId);
    return this.getChatPayload(chatId);
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
