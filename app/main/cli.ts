import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electron";
import { ApprovalMode, CliActivity, CliEvent, CliHealth, CliStatus } from "../shared/types";
import {
  ASSISTANT_REPLAY_CONFIRM_CHARS,
  ASSISTANT_REPLAY_MAX_MESSAGES,
  ASSISTANT_REPLAY_MAX_PENDING_CHARS,
  getAssistantChunkDelta
} from "./cli/assistant-replay";
import {
  collectStringValues,
  extractReasonFromAcpUpdate,
  extractTargetFromAcpUpdate,
  extractTopicSuggestion,
  flattenAcpText,
  looksLikePath,
  mapAcpToolKind,
  mapAcpToolStatus,
  normalizeAcpActivity,
  renderAcpToolBody,
  sanitizeReasonText
} from "./cli/activity-parser";
import { ACP_METHODS, AcpPendingRequest, AcpProcessState } from "./cli/types";
import {
  extractTextFromAcpContent,
  parseRpcError,
  readTextFileSlice,
  resolveWorkspaceFilePath,
  safeStringify
} from "./cli/utils";
import { getRuntimeConfig } from "./runtime-config";

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export class GeminiCliManager {
  private status: CliStatus = "stopped";
  private healthCheckPromise: Promise<CliHealth> | null = null;
  private readonly getMainWindow: () => BrowserWindow | null;
  private cliPath = getRuntimeConfig().cli.defaultExecutable;
  private listeners = new Set<(event: CliEvent) => void>();
  private activeProcess: AcpProcessState | null = null;

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow;
  }

  setCliPath(nextPath: string): void {
    this.cliPath = nextPath;
  }

  getStatus(): CliStatus {
    return this.status;
  }

  getCliPath(): string {
    return this.cliPath;
  }

  getActiveRunChatId(): string | null {
    return this.activeProcess?.promptInFlight ? this.activeProcess.chatId : null;
  }

  activateChat(nextChatId: string | null): void {
    if (!this.activeProcess) {
      return;
    }

    if (nextChatId && this.activeProcess.chatId === nextChatId) {
      return;
    }

    if (this.activeProcess.promptInFlight) {
      return;
    }
  }

  private getResolvedCliPath(): string {
    if (this.cliPath.includes("\\") || this.cliPath.includes("/")) {
      return this.cliPath;
    }

    for (const candidate of getRuntimeConfig().cli.pathCandidates) {
      const resolvedCandidate = candidate.replace("%APPDATA%", process.env.APPDATA ?? "");
      if (resolvedCandidate.includes("\\") || resolvedCandidate.includes("/")) {
        if (fs.existsSync(resolvedCandidate)) {
          return resolvedCandidate;
        }
      } else if (resolvedCandidate) {
        return resolvedCandidate;
      }
    }

    return this.cliPath;
  }

  private quoteForCmd(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private openDetachedTerminal(command: string, title: string): void {
    const safeTitle = title.replace(/[^\w\s-]/g, "").trim() || "Gemini CLI";
    const scriptPath = path.join(os.tmpdir(), `geminiapp-${safeTitle.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.cmd`);
    const scriptContent = [
      "@echo off",
      `title ${safeTitle}`,
      command,
      "echo.",
      "echo Press any key to close this window.",
      "pause > nul"
    ].join("\r\n");

    fs.writeFileSync(scriptPath, scriptContent, "utf8");

    spawn("cmd.exe", ["/d", "/c", "start", "", scriptPath], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    }).unref();
  }

  private spawnCli(args: string[], cwd?: string): ChildProcessWithoutNullStreams {
    const executable = this.getResolvedCliPath();
    return spawn("cmd.exe", ["/d", "/c", "call", executable, ...args], {
      cwd,
      windowsHide: true
    });
  }

  private async runCommand(
    args: string[],
    cwd?: string,
    timeoutMs = 12000
  ): Promise<{ code: number | null; stdout: string; stderr: string; error?: string; timedOut?: boolean }> {
    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const child = this.spawnCli(args, cwd);
      let settled = false;

      const finish = (result: { code: number | null; stdout: string; stderr: string; error?: string; timedOut?: boolean }) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore kill errors on timeout cleanup
        }
        finish({ code: null, stdout, stderr, error: "Timed out waiting for Gemini CLI response.", timedOut: true });
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (error) => {
        finish({ code: null, stdout, stderr, error: error.message });
      });

      child.on("close", (code) => {
        finish({ code, stdout, stderr });
      });
    });
  }

  private isLikelyMissingInstall(result: { code: number | null; stdout: string; stderr: string; error?: string }): boolean {
    const text = `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`.toLowerCase();
    return (
      text.includes("is not recognized") ||
      text.includes("not recognized") ||
      text.includes("enoent") ||
      text.includes("command not found") ||
      (this.getResolvedCliPath().includes("\\") && !fs.existsSync(this.getResolvedCliPath()))
    );
  }

  private isLikelyAuthFailure(text: string): boolean {
    const normalized = text.toLowerCase();
    return (
      normalized.includes("sign in") ||
      normalized.includes("login") ||
      normalized.includes("authenticate") ||
      normalized.includes("credential") ||
      normalized.includes("oauth") ||
      normalized.includes("unauthorized")
    );
  }

  private isBenignShellPtyNoise(text: string): boolean {
    const normalized = text.toLowerCase();
    return normalized.includes("conpty_console_list_agent.js") && normalized.includes("attachconsole failed");
  }

  private hasInstalledCandidate(): boolean {
    const resolved = this.getResolvedCliPath();
    if (resolved.includes("\\") || resolved.includes("/")) {
      return fs.existsSync(resolved);
    }
    return false;
  }

  async checkHealth(): Promise<CliHealth> {
    if (this.healthCheckPromise) {
      return this.healthCheckPromise;
    }

    this.healthCheckPromise = this.runHealthCheck();
    try {
      return await this.healthCheckPromise;
    } finally {
      this.healthCheckPromise = null;
    }
  }

  private async runHealthCheck(): Promise<CliHealth> {
    const versionResult = await this.runCommand(["--version"], undefined, 8000);
    if (versionResult.code !== 0 && this.isLikelyMissingInstall(versionResult) && !this.hasInstalledCandidate()) {
      this.status = "error";
      return {
        installed: false,
        authenticated: false,
        path: this.getResolvedCliPath(),
        status: "error",
        version: undefined,
        message: "Gemini CLI not found. Use Install Gemini CLI or set the correct CLI path."
      };
    }

    const version = versionResult.stdout.trim() || "installed";
    const versionFailureText = `${versionResult.stdout}\n${versionResult.stderr}\n${versionResult.error ?? ""}`.toLowerCase();
    if (versionResult.code !== 0 && this.hasInstalledCandidate() && !versionFailureText.includes("access is denied")) {
      this.status = "error";
      return {
        installed: true,
        authenticated: false,
        path: this.getResolvedCliPath(),
        status: "error",
        version,
        message: "Gemini CLI was found on disk, but it did not respond to version check. Try Open Gemini login terminal or verify the CLI path in settings."
      };
    }

    const runtimeConfig = getRuntimeConfig();
    const probeResult = await this.runCommand(
      ["-p", runtimeConfig.cli.healthcheck.prompt, ...runtimeConfig.cli.healthcheck.args],
      undefined,
      runtimeConfig.cli.healthcheck.timeoutMs
    );
    const combined = `${probeResult.stdout}\n${probeResult.stderr}`.trim();

    if (probeResult.code === 0) {
      this.status = "connected";
      return {
        installed: true,
        authenticated: true,
        path: this.getResolvedCliPath(),
        status: "connected",
        version,
        message: "Gemini CLI is installed and authenticated.",
        warnings: []
      };
    }

    if (this.isLikelyAuthFailure(combined)) {
      this.status = "error";
      return {
        installed: true,
        authenticated: false,
        path: this.getResolvedCliPath(),
        status: "error",
        version,
        message: "Gemini CLI is installed, but login is required. Open the Gemini login terminal and complete browser authentication.",
        warnings: []
      };
    }

    if (probeResult.timedOut) {
      this.status = "connected";
      return {
        installed: true,
        authenticated: true,
        path: this.getResolvedCliPath(),
        status: "connected",
        version,
        message: "Gemini CLI is installed and signed in. Health probe timed out, but the app will continue.",
        warnings: []
      };
    }

    this.status = "connected";
    return {
      installed: true,
      authenticated: true,
      path: this.getResolvedCliPath(),
      status: "connected",
      version,
      message: combined || "Gemini CLI is installed and appears signed in. Continuing despite a non-fatal probe error.",
      warnings: []
    };
  }

  subscribe(listener: (event: CliEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: CliEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
    const window = this.getMainWindow();
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send("cli:event", event);
    }
  }
private emitActivityWithId(
  chatId: string,
  activityId: string,
  kind: CliActivity["kind"],
  title: string,
  body: string,
  status: CliActivity["status"],
  extra?: Partial<Pick<CliActivity, "tone" | "target" | "reason" | "details" | "toolKind" | "suggestedChatTitle">>
): void {
  const messageId = this.activeProcess?.chatId === chatId ? this.activeProcess.currentAssistantMessageId : undefined;
  const scopedActivityId = messageId && !activityId.includes(messageId) ? `${activityId}_${messageId}` : activityId;
  const activity: CliActivity = {
    id: scopedActivityId,
    chatId,
    messageId,
    kind,
    title,
    body,
    status,
    createdAt: new Date().toISOString(),
    ...extra
  };

  this.emit({
    type: "activity",
    chatId,
    messageId: activity.messageId,
    activity,
    createdAt: activity.createdAt
  });
}

  private emitActivity(
    chatId: string,
    kind: CliActivity["kind"],
    title: string,
    body: string,
    status: CliActivity["status"],
    extra?: Partial<Pick<CliActivity, "tone" | "target" | "reason" | "details" | "toolKind" | "suggestedChatTitle">>
  ): void {
    this.emitActivityWithId(chatId, createId("activity"), kind, title, body, status, extra);
  }

  private summarizeStructuredPayload(payload: { stats?: unknown; stopReason?: string }): string {
    const parts: string[] = [];

    if (payload.stopReason) {
      parts.push(`Stop reason: ${payload.stopReason}.`);
    }

    if (payload.stats && typeof payload.stats === "object") {
      const statKeys = Object.keys(payload.stats as Record<string, unknown>);
      if (statKeys.length > 0) {
        parts.push(`Attached stats: ${statKeys.join(", ")}.`);
      }
    }

    return parts.join("\n") || "Structured Gemini CLI response received.";
  }

  private isSandboxBootstrapFailure(text: string): boolean {
    const normalized = text.toLowerCase();
    return normalized.includes("fatalsandboxerror") || (normalized.includes("sandbox image") && normalized.includes("could not be pulled"));
  }

  private shouldRetryWithoutSandbox(
    options: {
      sessionId?: string;
      model?: string;
      approvalMode?: ApprovalMode;
      sandbox?: boolean;
      allowSandboxFallback?: boolean;
      assumeAuthenticated?: boolean;
    } | undefined,
    state?: AcpProcessState | null,
    error?: unknown
  ): boolean {
    if (!options?.sandbox || options.allowSandboxFallback === false) {
      return false;
    }

    const combined = [
      state?.stderrBuffer,
      error instanceof Error ? error.message : typeof error === "string" ? error : ""
    ]
      .filter(Boolean)
      .join("\n");

    return this.isSandboxBootstrapFailure(combined);
  }

  private mapApprovalModeToAcpMode(mode?: ApprovalMode): string | undefined {
    switch (mode) {
      case "auto_edit":
        return "autoEdit";
      case "default":
      case "yolo":
      case "plan":
        return mode;
      default:
        return undefined;
    }
  }

  private advanceAssistantReplayCandidate(
    history: string[],
    candidate: NonNullable<AcpProcessState["assistantReplayCandidate"]>,
    text: string
  ): { status: "matched" | "mismatch" | "exhausted"; consumed: number } {
    let consumed = 0;
    while (consumed < text.length) {
      while (candidate.messageIndex < history.length && candidate.offset >= history[candidate.messageIndex].length) {
        candidate.messageIndex += 1;
        candidate.offset = 0;
      }

      if (candidate.messageIndex >= history.length) {
        return { status: "exhausted", consumed };
      }

      const message = history[candidate.messageIndex];
      const remainingText = text.slice(consumed);
      const expected = message.slice(candidate.offset, candidate.offset + remainingText.length);

      if (expected === remainingText || expected.startsWith(remainingText)) {
        candidate.offset += remainingText.length;
        return { status: "matched", consumed: text.length };
      }

      if (remainingText.startsWith(expected) && expected.length > 0) {
        consumed += expected.length;
        candidate.offset += expected.length;
        continue;
      }

      return { status: "mismatch", consumed };
    }

    return { status: "matched", consumed };
  }

  private findAssistantReplayCandidate(history: string[], chunk: string): AcpProcessState["assistantReplayCandidate"] {
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const message = history[index];
      if (!message) {
        continue;
      }

      const expected = message.slice(0, chunk.length);
      if (expected === chunk || expected.startsWith(chunk) || chunk.startsWith(expected)) {
        return {
          messageIndex: index,
          offset: 0,
          confirmed: false,
          pendingText: ""
        };
      }
    }
    return undefined;
  }

  private stripAssistantReplay(state: AcpProcessState, chunk: string): string {
    const history = state.assistantReplayHistory;
    if (!state.assistantReplayActive || !history || history.length === 0 || !chunk) {
      return chunk;
    }

    let candidate = state.assistantReplayCandidate;
    if (!candidate) {
      candidate = this.findAssistantReplayCandidate(history, chunk);
      if (!candidate) {
        state.assistantReplayActive = false;
        return chunk;
      }
      state.assistantReplayCandidate = candidate;
    }

    const result = this.advanceAssistantReplayCandidate(history, candidate, chunk);
    const matchedText = chunk.slice(0, result.consumed);
    if (!candidate.confirmed) {
      candidate.pendingText += matchedText;
      if (candidate.pendingText.length >= ASSISTANT_REPLAY_CONFIRM_CHARS) {
        candidate.confirmed = true;
        candidate.pendingText = "";
      } else if (candidate.pendingText.length >= ASSISTANT_REPLAY_MAX_PENDING_CHARS) {
        state.assistantReplayActive = false;
        state.assistantReplayCandidate = undefined;
        const pending = candidate.pendingText;
        candidate.pendingText = "";
        return pending + chunk.slice(result.consumed);
      }
    }

    if (result.status === "matched") {
      return "";
    }

    if (result.status === "exhausted") {
      state.assistantReplayActive = false;
      state.assistantReplayCandidate = undefined;
      // Reaching the end of the replay candidate confirms replay even for short prior answers.
      candidate.pendingText = "";
      return chunk.slice(result.consumed);
    }

    if (result.status === "mismatch") {
      state.assistantReplayActive = false;
      state.assistantReplayCandidate = undefined;
      const pending = candidate.confirmed ? "" : candidate.pendingText;
      candidate.pendingText = "";
      return pending + chunk.slice(result.consumed);
    }

    return "";
  }

  private getAssistantChunkDelta(state: AcpProcessState, chunk: string): string {
    let currentChunk = this.stripAssistantReplay(state, chunk);
    if (!currentChunk) {
      return "";
    }

    if (state.currentAssistantText && currentChunk.startsWith(state.currentAssistantText)) {
      const delta = currentChunk.slice(state.currentAssistantText.length);
      state.currentAssistantText = currentChunk;
      return delta;
    }

    state.currentAssistantText += currentChunk;
    return currentChunk;
  }

  private extractQuotaStats(result: unknown): unknown {
    if (!result || typeof result !== "object") {
      return undefined;
    }

    const record = result as Record<string, unknown>;
    const meta = record._meta;
    if (!meta || typeof meta !== "object") {
      return undefined;
    }

    const quota = (meta as Record<string, unknown>).quota;
    return quota;
  }

  private sendRpcRequest(state: AcpProcessState, method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++state.nextRequestId;
      state.pendingRequests.set(id, { method, resolve, reject });
      state.process.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, "utf8", (error) => {
        if (!error) {
          return;
        }
        state.pendingRequests.delete(id);
        reject(error);
      });
    });
  }

  private sendRpcNotification(state: AcpProcessState, method: string, params: Record<string, unknown>): void {
    state.process.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  private sendRpcResponse(state: AcpProcessState, id: number, result: unknown): void {
    state.process.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  }

  private sendRpcError(state: AcpProcessState, id: number, code: number, message: string): void {
    state.process.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
  }

  private async initializeAcp(state: AcpProcessState): Promise<void> {
    await this.sendRpcRequest(state, ACP_METHODS.initialize, {
      protocolVersion: 1,
      clientInfo: {
        name: "geminiapp",
        version: "0.1.15"
      },
      clientCapabilities: {
        auth: { terminal: false },
        fs: { readTextFile: true, writeTextFile: true },
        terminal: false
      }
    });
  }

  private async handleAcpReadTextFileRequest(state: AcpProcessState, payload: Record<string, unknown>): Promise<void> {
    const requestId = typeof payload.id === "number" ? payload.id : undefined;
    if (requestId === undefined) {
      return;
    }

    try {
      const params = payload.params && typeof payload.params === "object" ? payload.params as Record<string, unknown> : {};
      const resolvedPath = resolveWorkspaceFilePath(state.workspacePath, params.path);
      const line = typeof params.line === "number" ? params.line : undefined;
      const limit = typeof params.limit === "number" ? params.limit : undefined;
      const content = await fs.promises.readFile(resolvedPath, "utf8");

      this.sendRpcResponse(state, requestId, {
        content: readTextFileSlice(content, line, limit)
      });
    } catch (error) {
      this.sendRpcError(state, requestId, -32001, error instanceof Error ? error.message : "Failed to read text file.");
    }
  }

  private async handleAcpWriteTextFileRequest(state: AcpProcessState, payload: Record<string, unknown>): Promise<void> {
    const requestId = typeof payload.id === "number" ? payload.id : undefined;
    if (requestId === undefined) {
      return;
    }

    try {
      const params = payload.params && typeof payload.params === "object" ? payload.params as Record<string, unknown> : {};
      const resolvedPath = resolveWorkspaceFilePath(state.workspacePath, params.path);
      const content = typeof params.content === "string" ? params.content : "";

      await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.promises.writeFile(resolvedPath, content, "utf8");

      this.sendRpcResponse(state, requestId, null);
    } catch (error) {
      this.sendRpcError(state, requestId, -32002, error instanceof Error ? error.message : "Failed to write text file.");
    }
  }

  private summarizePermissionRequest(params: Record<string, unknown>): {
    title: string;
    body: string;
    tone: NonNullable<CliActivity["tone"]>;
    target?: string;
    reason?: string;
    details?: string;
  } {
    const toolCall = params.toolCall && typeof params.toolCall === "object" ? params.toolCall as Record<string, unknown> : {};
    const normalized = normalizeAcpActivity(toolCall);
    const optionKinds = Array.isArray(params.options)
      ? (params.options as Array<Record<string, unknown>>)
          .map((option) => typeof option.kind === "string" ? option.kind : undefined)
          .filter((kind): kind is string => Boolean(kind))
      : [];
    const permissionSuffix = optionKinds.length > 0 ? `Available options: ${optionKinds.join(", ")}.` : "Awaiting approval policy.";
    const body = [normalized.reason, permissionSuffix].filter(Boolean).join("\n");

    return {
      title: `Permission: ${normalized.title}`,
      body: body || permissionSuffix,
      tone: normalized.tone ?? "status",
      target: normalized.target,
      reason: normalized.reason,
      details: normalized.details
    };
  }

  private createAcpProcess(chatId: string, workspacePath: string, sandbox: boolean, allowSandboxFallback: boolean): AcpProcessState {
    const args = ["--acp", "--skip-trust"];
    if (sandbox) {
      args.push("--sandbox");
    }

    const executable = this.getResolvedCliPath();
    const process = this.spawnCli(args, workspacePath);
    const state: AcpProcessState = {
      chatId,
      workspacePath,
      process,
      stdoutBuffer: "",
      stderrBuffer: "",
      nextRequestId: 0,
      pendingRequests: new Map<number, AcpPendingRequest>(),
      sandboxEnabled: sandbox,
      allowSandboxFallback,
      stopRequested: false,
      cancelRequested: false,
      promptInFlight: false,
      currentAssistantMessageId: undefined,
      currentAssistantText: "",
      assistantReplayActive: false,
      reasoningSequence: 0
    };

    this.emitActivity(chatId, "command", "gemini session", [executable, ...args].join(" "), "running");

    process.stdout.on("data", (chunk: Buffer) => {
      state.stdoutBuffer += chunk.toString("utf8");
      this.status = state.promptInFlight ? "streaming" : this.status;

      while (state.stdoutBuffer.includes("\n")) {
        const newlineIndex = state.stdoutBuffer.indexOf("\n");
        const line = state.stdoutBuffer.slice(0, newlineIndex).trim();
        state.stdoutBuffer = state.stdoutBuffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }
        this.handleAcpStdoutLine(state, line);
      }
    });

    process.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      state.stderrBuffer += text;
      if (this.isBenignShellPtyNoise(text)) {
        return;
      }
      this.emitActivity(chatId, "stderr", "stderr", text, "error");
    });

    process.on("close", (code) => {
      const errorMessage = state.stderrBuffer.trim() || `Gemini CLI ACP exited with code ${code ?? -1}.`;
      for (const [, pending] of state.pendingRequests) {
        pending.reject(new Error(errorMessage));
      }
      state.pendingRequests.clear();

      if (this.activeProcess === state) {
        this.activeProcess = null;
      }

      const sandboxRetryInProgress =
        state.promptInFlight && state.sandboxEnabled && state.allowSandboxFallback && this.isSandboxBootstrapFailure(errorMessage);

      if (sandboxRetryInProgress) {
        return;
      }

      if (!state.stopRequested && state.promptInFlight) {
        this.status = "error";
        this.emit({
          type: "error",
          chatId: state.chatId,
          createdAt: new Date().toISOString(),
          message: errorMessage,
          messageId: state.currentAssistantMessageId
        });
      }

      if (!state.stopRequested && !state.promptInFlight) {
        this.status = "stopped";
      }
    });

    return state;
  }

  private handleAcpStdoutLine(state: AcpProcessState, line: string): void {
    try {
      const payload = JSON.parse(line) as Record<string, unknown>;

      if (typeof payload.method === "string") {
        if (payload.method === ACP_METHODS.sessionUpdate) {
          this.handleAcpSessionUpdate(state, payload);
          return;
        }

        if (payload.method === ACP_METHODS.sessionRequestPermission) {
          this.handleAcpPermissionRequest(state, payload);
          return;
        }

        if (payload.method === ACP_METHODS.fsReadTextFile) {
          void this.handleAcpReadTextFileRequest(state, payload);
          return;
        }

        if (payload.method === ACP_METHODS.fsWriteTextFile) {
          void this.handleAcpWriteTextFileRequest(state, payload);
          return;
        }

        if (typeof payload.id === "number") {
          this.sendRpcError(state, payload.id, -32601, `Unsupported client method: ${payload.method}`);
        }
        return;
      }

      if (typeof payload.id === "number") {
        const pending = state.pendingRequests.get(payload.id);
        if (!pending) {
          return;
        }
        state.pendingRequests.delete(payload.id);

        if (payload.error) {
          pending.reject(parseRpcError(payload.error, `${pending.method} failed.`));
          return;
        }

        pending.resolve(payload.result);
      }
    } catch {
      this.emitActivity(state.chatId, "stdout", "Gemini output", line, "done");
    }
  }

  private handleAcpPermissionRequest(state: AcpProcessState, payload: Record<string, unknown>): void {
    const requestId = typeof payload.id === "number" ? payload.id : undefined;
    if (requestId === undefined) {
      return;
    }

    const params = payload.params && typeof payload.params === "object" ? payload.params as Record<string, unknown> : {};
    const options = Array.isArray(params.options) ? params.options as Array<Record<string, unknown>> : [];
    const selected = this.selectPermissionOption(options, state.currentModeId);
    const summary = this.summarizePermissionRequest(params);
    const activityId = `acp_permission_${requestId}`;

    this.emitActivityWithId(state.chatId, activityId, "status", summary.title, summary.body, "running", {
      tone: summary.tone,
      target: summary.target,
      reason: summary.reason,
      details: summary.details
    });

    if (!selected) {
      this.emitActivityWithId(state.chatId, activityId, "status", summary.title, `${summary.body}\nPermission request was cancelled.`, "error", {
        tone: "error",
        target: summary.target,
        reason: summary.reason,
        details: summary.details
      });
      this.sendRpcResponse(state, requestId, {
        outcome: {
          outcome: "cancelled"
        }
      });
      return;
    }

    this.emitActivityWithId(state.chatId, activityId, "status", summary.title, `${summary.body}\nSelected: ${selected}.`, "done", {
      tone: summary.tone,
      target: summary.target,
      reason: summary.reason,
      details: summary.details
    });
    this.sendRpcResponse(state, requestId, {
      outcome: {
        outcome: "selected",
        optionId: selected
      }
    });
  }

  private selectPermissionOption(options: Array<Record<string, unknown>>, currentModeId?: string): string | undefined {
    const selectByKind = (kind: string) =>
      options.find((option) => option.kind === kind && typeof option.optionId === "string")?.optionId as string | undefined;

    if (currentModeId === "plan") {
      return selectByKind("reject_once");
    }

    if (currentModeId === "yolo") {
      return selectByKind("allow_always") ?? selectByKind("allow_once");
    }

    if (currentModeId === "autoEdit") {
      return selectByKind("allow_once") ?? selectByKind("allow_always");
    }

    return selectByKind("allow_once") ?? selectByKind("allow_always");
  }

  private handleAcpSessionUpdate(state: AcpProcessState, payload: Record<string, unknown>): void {
    const params = payload.params && typeof payload.params === "object" ? payload.params as Record<string, unknown> : {};
    const update = params.update && typeof params.update === "object" ? params.update as Record<string, unknown> : null;
    if (!update) {
      return;
    }

    const createdAt = new Date().toISOString();
    const updateType = update.sessionUpdate;

    if (updateType === "agent_message_chunk") {
      const token = getAssistantChunkDelta(state, extractTextFromAcpContent(update.content));
      if (token) {
        this.status = "streaming";
        this.emit({
          type: "assistant_token",
          chatId: state.chatId,
          createdAt,
          token,
          messageId: state.currentAssistantMessageId
        });
      }
      return;
    }

    if (updateType === "tool_call" || updateType === "tool_call_update") {
      const toolCallId = typeof update.toolCallId === "string" ? update.toolCallId : createId("acp_tool");
      const normalized = normalizeAcpActivity(update);
      this.emitActivityWithId(
        state.chatId,
        `acp_tool_${toolCallId}`,
        normalized.kind,
        normalized.title,
        normalized.body,
        normalized.status,
        {
          tone: normalized.tone,
          target: normalized.target,
          reason: normalized.reason,
          details: normalized.details,
          toolKind: normalized.toolKind,
          suggestedChatTitle: normalized.suggestedChatTitle
        }
      );
      return;
    }

    if (updateType === "current_mode_update") {
      state.currentModeId = typeof update.currentModeId === "string" ? update.currentModeId : state.currentModeId;
      return;
    }

    if (updateType === "session_info_update") {
      return;
    }

    if (updateType === "agent_thought_chunk") {
      const chunk = extractTextFromAcpContent(update.content);
      if (chunk.trim()) {
        if (state.lastReasoningActivityId) {
          this.emitActivityWithId(
            state.chatId,
            state.lastReasoningActivityId,
            "stdout",
            "Thinking",
            state.lastReasoningChunk ?? "",
            "done",
            {
              tone: "reasoning",
              reason: state.lastReasoningChunk ?? "",
              details: state.lastReasoningChunk ?? "",
              toolKind: "think"
            }
          );
        }
        const nextChunk = chunk.trim();
        const activityId = `acp_think_${state.currentAssistantMessageId ?? state.chatId}_${state.reasoningSequence++}`;
        state.lastReasoningActivityId = activityId;
        state.lastReasoningChunk = nextChunk;
        this.emitActivityWithId(
          state.chatId,
          activityId,
          "stdout",
          "Thinking",
          nextChunk,
          "running",
          {
            tone: "reasoning",
            reason: nextChunk,
            details: nextChunk,
            toolKind: "think"
          }
        );
      }
      return;
    }

    if (updateType === "usage_update" || updateType === "available_commands_update" || updateType === "config_option_update" || updateType === "plan" || updateType === "user_message_chunk") {
      return;
    }

    this.emitActivity(state.chatId, "stdout", "ACP update", safeStringify(update), "done");
  }

  private applySessionState(state: AcpProcessState, sessionId: string, result: unknown): void {
    state.acpSessionId = sessionId;

    if (result && typeof result === "object") {
      const record = result as Record<string, unknown>;
      if (record.models && typeof record.models === "object") {
        const currentModelId = (record.models as Record<string, unknown>).currentModelId;
        if (typeof currentModelId === "string") {
          state.currentModelId = currentModelId;
        }
      }
      if (record.modes && typeof record.modes === "object") {
        const currentModeId = (record.modes as Record<string, unknown>).currentModeId;
        if (typeof currentModeId === "string") {
          state.currentModeId = currentModeId;
        }
      }
    }

    this.emit({
      type: "session_initialized",
      chatId: state.chatId,
      createdAt: new Date().toISOString(),
      sessionId,
      model: state.currentModelId
    });
  }

  private async openOrLoadSession(state: AcpProcessState, sessionId?: string): Promise<void> {
    if (state.acpSessionId) {
      return;
    }

    if (sessionId) {
      try {
        const result = await this.sendRpcRequest(state, ACP_METHODS.sessionLoad, {
          cwd: state.workspacePath,
          mcpServers: [],
          sessionId
        });
        this.applySessionState(state, sessionId, result);
        return;
      } catch (error) {
        this.emitActivity(
          state.chatId,
          "status",
          "Started new session",
          `Saved session ${sessionId} could not be loaded, so GeminiUI created a new ACP session for this chat. Previous CLI context may be unavailable.`,
          "done"
        );
      }
    }

    const result = await this.sendRpcRequest(state, ACP_METHODS.sessionNew, {
      cwd: state.workspacePath,
      mcpServers: []
    });
    const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
    const nextSessionId = typeof record.sessionId === "string" ? record.sessionId : createId("acp_session");
    this.applySessionState(state, nextSessionId, result);
  }

  private async synchronizeSessionSettings(state: AcpProcessState, options?: { model?: string; approvalMode?: ApprovalMode }): Promise<void> {
    if (!state.acpSessionId) {
      return;
    }

    const targetMode = this.mapApprovalModeToAcpMode(options?.approvalMode);
    if (targetMode && targetMode !== state.currentModeId) {
      await this.sendRpcRequest(state, ACP_METHODS.sessionSetMode, {
        sessionId: state.acpSessionId,
        modeId: targetMode
      });
      state.currentModeId = targetMode;
    }

    if (options?.model && options.model !== state.currentModelId) {
      await this.sendRpcRequest(state, ACP_METHODS.sessionSetModel, {
        sessionId: state.acpSessionId,
        modelId: options.model
      });
      state.currentModelId = options.model;
    }
  }

  private async ensureProcess(
    chatId: string,
    workspacePath: string,
    options?: {
      sessionId?: string;
      model?: string;
      approvalMode?: ApprovalMode;
      sandbox?: boolean;
      allowSandboxFallback?: boolean;
      assistantMessageId?: string;
    }
  ): Promise<{ state: AcpProcessState; startedFresh: boolean }> {
    const needsFreshProcess =
      !this.activeProcess ||
      this.activeProcess.chatId !== chatId ||
      this.activeProcess.workspacePath !== workspacePath ||
      this.activeProcess.sandboxEnabled !== (options?.sandbox ?? false);

    if (needsFreshProcess && this.activeProcess) {
      this.terminateProcess(this.activeProcess, {
        emitUserVisibleStop: false
      });
    }

    if (!needsFreshProcess && this.activeProcess) {
      await this.synchronizeSessionSettings(this.activeProcess, options);
      return {
        state: this.activeProcess,
        startedFresh: false
      };
    }

    try {
      const state = this.createAcpProcess(chatId, workspacePath, options?.sandbox ?? false, options?.allowSandboxFallback ?? true);
      this.activeProcess = state;
      state.currentAssistantMessageId = options?.assistantMessageId;
      await this.initializeAcp(state);
      await this.openOrLoadSession(state, options?.sessionId);
      await this.synchronizeSessionSettings(state, options);
      return { state, startedFresh: true };
    } catch (error) {
      const activeProcess = this.activeProcess;
      const stderr = activeProcess?.stderrBuffer ?? "";
      if (options?.sandbox && options.allowSandboxFallback !== false && this.isSandboxBootstrapFailure(stderr)) {
        this.emitActivity(chatId, "status", "Sandbox unavailable", "Retrying the request without sandbox because Gemini CLI could not start its sandbox image.", "done");
        if (activeProcess) {
          this.terminateProcess(activeProcess, { emitUserVisibleStop: false });
        }
        return await this.ensureProcess(chatId, workspacePath, {
          ...options,
          sandbox: false,
          allowSandboxFallback: false
        });
      }
      throw error;
    }
  }

  installGlobally(): void {
    this.openDetachedTerminal(
      "npm install -g @google/gemini-cli && echo. && echo Installation finished. You can close this window. || pause",
      "Gemini CLI Install"
    );
  }

  openLoginShell(): void {
    const executable = this.getResolvedCliPath();
    const quotedExecutable = this.quoteForCmd(executable);
    const loginCommand = `call ${quotedExecutable} || pause`;
    this.openDetachedTerminal(loginCommand, "Gemini CLI Login");
  }

  async sendPrompt(
    chatId: string,
    prompt: string,
    promptAttachments: Array<Record<string, unknown>>,
    workspacePath: string,
    options?: {
      sessionId?: string;
      model?: string;
      approvalMode?: ApprovalMode;
      sandbox?: boolean;
      allowSandboxFallback?: boolean;
      assumeAuthenticated?: boolean;
      assistantMessageId?: string;
      assistantReplayHistory?: string[];
    }
  ): Promise<void> {
    const health = options?.assumeAuthenticated
      ? {
          installed: true,
          authenticated: true,
          path: this.getResolvedCliPath(),
          status: "connected" as const,
          version: undefined,
          message: "Gemini CLI authentication was manually confirmed."
        }
      : await this.checkHealth();

    if (!health.installed || !health.authenticated) {
      this.status = "error";
      this.emit({
        type: "error",
        chatId,
        createdAt: new Date().toISOString(),
        message: health.message
      });
      return;
    }

    let ensured: { state: AcpProcessState; startedFresh: boolean };
    try {
      ensured = await this.ensureProcess(chatId, workspacePath, options);
    } catch (error) {
      if (this.shouldRetryWithoutSandbox(options, this.activeProcess, error)) {
        if (this.activeProcess) {
          this.terminateProcess(this.activeProcess, { emitUserVisibleStop: false });
        }
        this.emitActivity(chatId, "status", "Sandbox unavailable", "Retrying the request without sandbox because Gemini CLI could not start its sandbox image.", "done");
        await this.sendPrompt(chatId, prompt, promptAttachments, workspacePath, {
          ...options,
          sandbox: false,
          allowSandboxFallback: false
        });
        return;
      }

      this.status = "error";
      const errorState = this.activeProcess;
      const durationMs = errorState?.startTime ? Date.now() - errorState.startTime : undefined;
      const assistantMessageId = options?.assistantMessageId ?? errorState?.currentAssistantMessageId;

      this.emit({
        type: "error",
        chatId,
        createdAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
        messageId: assistantMessageId
      });
      this.emit({
        type: "completed",
        chatId,
        createdAt: new Date().toISOString(),
        messageId: assistantMessageId,
        durationMs
      });
      return;
    }

    const { state, startedFresh } = ensured;

    this.status = startedFresh ? "starting" : "busy";
    this.emit({
      type: "status",
      chatId,
      createdAt: new Date().toISOString(),
      status: startedFresh ? "starting" : "busy",
      detail: startedFresh ? "Launching Gemini CLI ACP session" : "Reusing Gemini CLI ACP session"
    });

    state.promptInFlight = true;
    state.cancelRequested = false;
    state.currentAssistantMessageId = options?.assistantMessageId;
    state.currentAssistantText = "";
    state.assistantReplayHistory = options?.assistantReplayHistory?.slice(-ASSISTANT_REPLAY_MAX_MESSAGES);
    state.assistantReplayCandidate = undefined;
    state.assistantReplayActive = Boolean(state.assistantReplayHistory?.length);
    state.startTime = Date.now();
    this.emitActivity(chatId, "status", startedFresh ? "Persistent session ready" : "Using persistent session", `Session ${state.acpSessionId ?? "pending"} in ${path.basename(workspacePath)}`, "done");

    try {
      const promptBlocks = prompt.trim() || promptAttachments.length === 0
        ? [
            ...promptAttachments,
            {
              type: "text",
              text: prompt
            }
          ]
        : promptAttachments;
      const result = await this.sendRpcRequest(state, ACP_METHODS.sessionPrompt, {
        sessionId: state.acpSessionId,
        prompt: promptBlocks
      });
      const resultRecord = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const stopReason = typeof resultRecord.stopReason === "string" ? resultRecord.stopReason : undefined;
      const stats = this.extractQuotaStats(result);

      if (state.cancelRequested || stopReason === "cancelled") {
        this.status = "stopped";
        this.emitActivity(chatId, "status", "Generation stopped", "The active Gemini CLI generation was cancelled.", "done");
        this.emit({
          type: "status",
          chatId,
          createdAt: new Date().toISOString(),
          status: "stopped",
          detail: "Generation stopped by user"
        });
      } else {
        this.status = "connected";
        this.emit({
          type: "status",
          chatId,
          createdAt: new Date().toISOString(),
          status: "connected",
          detail: "Gemini CLI finished"
        });
      }

      this.emit({
        type: "run_summary",
        chatId,
        createdAt: new Date().toISOString(),
        sessionId: state.acpSessionId,
        model: state.currentModelId,
        stats
      });
      this.emitActivity(chatId, "status", "Structured response", this.summarizeStructuredPayload({ stats, stopReason }), "done");
      const durationMs = state.startTime ? Date.now() - state.startTime : undefined;
      this.emit({ type: "completed", chatId, createdAt: new Date().toISOString(), messageId: state.currentAssistantMessageId, durationMs });
    } catch (error) {
      if (state.stopRequested || state.cancelRequested) {
        return;
      }

      if (this.shouldRetryWithoutSandbox(options, state, error)) {
        this.emitActivity(chatId, "status", "Sandbox unavailable", "Retrying the request without sandbox because Gemini CLI could not start its sandbox image.", "done");
        this.terminateProcess(state, { emitUserVisibleStop: false });
        await this.sendPrompt(chatId, prompt, promptAttachments, workspacePath, {
          ...options,
          sandbox: false,
          allowSandboxFallback: false
        });
        return;
      }

      this.status = "error";
      const durationMs = state.startTime ? Date.now() - state.startTime : undefined;
      this.emit({
        type: "error",
        chatId,
        createdAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
        messageId: state.currentAssistantMessageId
      });
      this.emit({
        type: "completed",
        chatId,
        createdAt: new Date().toISOString(),
        messageId: state.currentAssistantMessageId,
        durationMs
      });
    } finally {
      state.promptInFlight = false;
      state.cancelRequested = false;
      state.lastReasoningActivityId = undefined;
      state.lastReasoningChunk = undefined;
      state.reasoningSequence = 0;
      state.currentAssistantMessageId = undefined;
      state.currentAssistantText = "";
      state.assistantReplayHistory = undefined;
      state.assistantReplayCandidate = undefined;
      state.assistantReplayActive = false;
      if (this.status === "busy") {
        this.status = "connected";
      }
    }
  }

  stop(chatId?: string): void {
    const state = this.activeProcess;
    if (!state || !state.acpSessionId) {
      return;
    }

    if (chatId && state.chatId !== chatId) {
      return;
    }

    state.cancelRequested = true;
    this.terminateProcess(state, {
      emitUserVisibleStop: true,
      detail: "Generation stopped by user."
    });
  }

  private terminateProcess(state: AcpProcessState, options: { emitUserVisibleStop: boolean; detail?: string }): void {
    if (state.stopRequested) {
      return;
    }

    state.stopRequested = true;
    state.cancelRequested = false;
    state.promptInFlight = false;

    if (options.emitUserVisibleStop) {
      this.status = "stopped";
      this.emitActivity(state.chatId, "status", "Generation stopped", options.detail ?? "The active Gemini CLI process was terminated.", "done");
      this.emit({
        type: "status",
        chatId: state.chatId,
        createdAt: new Date().toISOString(),
        status: "stopped",
        detail: options.detail ?? "Generation stopped"
      });
      const durationMs = state.startTime ? Date.now() - state.startTime : undefined;
      this.emit({
        type: "completed",
        chatId: state.chatId,
        createdAt: new Date().toISOString(),
        messageId: state.currentAssistantMessageId,
        durationMs
      });
    }

    try {
      state.process.kill();
    } catch {
      // ignore kill errors during cleanup
    }

    if (this.activeProcess === state) {
      this.activeProcess = null;
    }
  }

  shutdown(): void {
    if (this.activeProcess) {
      this.terminateProcess(this.activeProcess, { emitUserVisibleStop: false });
    }
  }
}
