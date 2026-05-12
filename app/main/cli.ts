import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow } from "electron";
import { ApprovalMode, CliActivity, CliEvent, CliHealth, CliStatus } from "../shared/types";
import { getRuntimeConfig } from "./runtime-config";

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type AcpPendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type AcpProcessState = {
  chatId: string;
  workspacePath: string;
  process: ChildProcessWithoutNullStreams;
  stdoutBuffer: string;
  stderrBuffer: string;
  nextRequestId: number;
  pendingRequests: Map<number, AcpPendingRequest>;
  acpSessionId?: string;
  currentModelId?: string;
  currentModeId?: string;
  sandboxEnabled: boolean;
  allowSandboxFallback: boolean;
  stopRequested: boolean;
  cancelRequested: boolean;
  promptInFlight: boolean;
  currentAssistantMessageId?: string;
  startTime?: number;
};

const ACP_METHODS = {
  initialize: "initialize",
  sessionCancel: "session/cancel",
  sessionLoad: "session/load",
  sessionNew: "session/new",
  sessionPrompt: "session/prompt",
  sessionRequestPermission: "session/request_permission",
  sessionSetMode: "session/set_mode",
  sessionSetModel: "session/set_model",
  sessionUpdate: "session/update"
} as const;

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

  activateChat(nextChatId: string | null): void {
    if (!this.activeProcess) {
      return;
    }

    if (nextChatId && this.activeProcess.chatId === nextChatId) {
      return;
    }

    this.terminateProcess(this.activeProcess, {
      emitUserVisibleStop: true,
      detail: nextChatId ? "Generation stopped because you switched chats." : "Generation stopped because the active chat changed."
    });
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
private emitActivityWithId(chatId: string, activityId: string, kind: CliActivity["kind"], title: string, body: string, status: CliActivity["status"]): void {
  const activity: CliActivity = {
    id: activityId,
    chatId,
    messageId: this.activeProcess?.chatId === chatId ? this.activeProcess.currentAssistantMessageId : undefined,
    kind,
    title,
    body,
    status,
    createdAt: new Date().toISOString()
  };

  this.emit({
    type: "activity",
    chatId,
    messageId: activity.messageId,
    activity,
    createdAt: activity.createdAt
  });
}

  private emitActivity(chatId: string, kind: CliActivity["kind"], title: string, body: string, status: CliActivity["status"]): void {
    this.emitActivityWithId(chatId, createId("activity"), kind, title, body, status);
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

  private mapAcpToolStatus(status: unknown): CliActivity["status"] {
    if (status === "failed") {
      return "error";
    }
    if (status === "completed") {
      return "done";
    }
    return "running";
  }

  private mapAcpToolKind(kind: unknown): CliActivity["kind"] {
    if (kind === "execute") {
      return "command";
    }
    if (kind === "fetch" || kind === "read" || kind === "search" || kind === "think") {
      return "stdout";
    }
    return "command";
  }

  private parseRpcError(errorPayload: unknown, fallbackMessage: string): Error {
    if (!errorPayload || typeof errorPayload !== "object") {
      return new Error(fallbackMessage);
    }
    const errorRecord = errorPayload as Record<string, unknown>;
    const message = typeof errorRecord.message === "string" ? errorRecord.message : fallbackMessage;
    const details = errorRecord.data && typeof errorRecord.data === "object" ? (errorRecord.data as Record<string, unknown>).details : undefined;
    return new Error(typeof details === "string" && details ? `${message}: ${details}` : message);
  }

  private safeStringify(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private extractTextFromAcpContent(content: unknown): string {
    if (!content || typeof content !== "object") {
      return "";
    }

    const record = content as Record<string, unknown>;
    const directType = record.type;
    if (directType === "text" && typeof record.text === "string") {
      return record.text;
    }

    if (directType === "content" && record.content && typeof record.content === "object") {
      const nested = record.content as Record<string, unknown>;
      if (nested.type === "text" && typeof nested.text === "string") {
        return nested.text;
      }
    }

    return "";
  }

  private renderAcpToolBody(update: Record<string, unknown>): string {
    const parts: string[] = [];
    const kind = typeof update.kind === "string" ? update.kind : undefined;
    const status = typeof update.status === "string" ? update.status : undefined;
    const title = typeof update.title === "string" ? update.title : undefined;

    if (title) {
      parts.push(title);
    }
    if (kind) {
      parts.push(`kind: ${kind}`);
    }
    if (status) {
      parts.push(`status: ${status}`);
    }

    const locations = Array.isArray(update.locations) ? update.locations : [];
    if (locations.length > 0) {
      parts.push(`locations: ${this.safeStringify(locations)}`);
    }

    const content = Array.isArray(update.content) ? update.content : [];
    if (content.length > 0) {
      const renderedContent = content
        .map((item) => this.extractTextFromAcpContent(item) || this.safeStringify(item))
        .filter(Boolean)
        .join("\n");
      if (renderedContent) {
        parts.push(renderedContent);
      }
    }

    if (update.rawInput !== undefined) {
      parts.push(`rawInput: ${this.safeStringify(update.rawInput)}`);
    }
    if (update.rawOutput !== undefined) {
      parts.push(`rawOutput: ${this.safeStringify(update.rawOutput)}`);
    }

    return parts.join("\n");
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

  private sendRpcResponse(state: AcpProcessState, id: number, result: Record<string, unknown>): void {
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
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false
      }
    });
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
      currentAssistantMessageId: undefined
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
          pending.reject(this.parseRpcError(payload.error, `${pending.method} failed.`));
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
    if (!requestId) {
      return;
    }

    const params = payload.params && typeof payload.params === "object" ? payload.params as Record<string, unknown> : {};
    const options = Array.isArray(params.options) ? params.options as Array<Record<string, unknown>> : [];
    const selected = this.selectPermissionOption(options, state.currentModeId);

    if (!selected) {
      this.sendRpcResponse(state, requestId, {
        outcome: {
          outcome: "cancelled"
        }
      });
      return;
    }

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
      const token = this.extractTextFromAcpContent(update.content);
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
      const title = typeof update.title === "string" && update.title.trim() ? update.title : "Tool call";
      this.emitActivityWithId(
        state.chatId,
        `acp_tool_${toolCallId}`,
        this.mapAcpToolKind(update.kind),
        title,
        this.renderAcpToolBody(update),
        this.mapAcpToolStatus(update.status)
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

    if (updateType === "usage_update" || updateType === "available_commands_update" || updateType === "config_option_update" || updateType === "plan" || updateType === "user_message_chunk" || updateType === "agent_thought_chunk") {
      return;
    }

    this.emitActivity(state.chatId, "stdout", "ACP update", this.safeStringify(update), "done");
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
        this.emitActivity(state.chatId, "status", "Session reset", `Failed to load saved session ${sessionId}. Starting a fresh ACP session instead.`, "done");
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
    workspacePath: string,
    options?: {
      sessionId?: string;
      model?: string;
      approvalMode?: ApprovalMode;
      sandbox?: boolean;
      allowSandboxFallback?: boolean;
      assumeAuthenticated?: boolean;
      assistantMessageId?: string;
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
        await this.sendPrompt(chatId, prompt, workspacePath, {
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
    state.startTime = Date.now();
    this.emitActivity(chatId, "status", startedFresh ? "Persistent session ready" : "Using persistent session", `Session ${state.acpSessionId ?? "pending"} in ${path.basename(workspacePath)}`, "done");

    try {
      const result = await this.sendRpcRequest(state, ACP_METHODS.sessionPrompt, {
        sessionId: state.acpSessionId,
        prompt: [
          {
            type: "text",
            text: prompt
          }
        ]
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
        await this.sendPrompt(chatId, prompt, workspacePath, {
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
      state.currentAssistantMessageId = undefined;
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
