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

export class GeminiCliManager {
  private status: CliStatus = "stopped";
  private process: ChildProcessWithoutNullStreams | null = null;
  private currentChatId: string | null = null;
  private readonly getMainWindow: () => BrowserWindow | null;
  private cliPath = getRuntimeConfig().cli.defaultExecutable;
  private listeners = new Set<(event: CliEvent) => void>();

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
    window?.webContents.send("cli:event", event);
  }

  private emitActivity(chatId: string, kind: CliActivity["kind"], title: string, body: string, status: CliActivity["status"]): void {
    const activity: CliActivity = {
      id: createId("activity"),
      chatId,
      kind,
      title,
      body,
      status,
      createdAt: new Date().toISOString()
    };
    this.emit({
      type: "activity",
      activity,
      chatId,
      createdAt: activity.createdAt
    });
  }

  private summarizeStructuredPayload(payload: { response?: string; stats?: unknown; error?: unknown }): string {
    const parts: string[] = [];

    if (payload.response) {
      parts.push("Assistant response received.");
    }

    if (payload.stats && typeof payload.stats === "object") {
      const statKeys = Object.keys(payload.stats as Record<string, unknown>);
      if (statKeys.length > 0) {
        parts.push(`Attached stats: ${statKeys.join(", ")}.`);
      }
    }

    if (payload.error) {
      parts.push(`Reported error payload: ${String(payload.error)}`);
    }

    return parts.join("\n") || "Structured Gemini CLI response received.";
  }

  private extractSessionId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const direct = record.sessionId ?? record.session_id;
    if (typeof direct === "string" && direct.trim()) {
      return direct;
    }

    if (record.session && typeof record.session === "object") {
      const nested = record.session as Record<string, unknown>;
      const nestedId = nested.id ?? nested.sessionId ?? nested.session_id;
      if (typeof nestedId === "string" && nestedId.trim()) {
        return nestedId;
      }
    }

    return undefined;
  }

  private extractModel(payload: unknown): string | undefined {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const direct = record.model ?? record.modelId ?? record.model_id;
    if (typeof direct === "string" && direct.trim()) {
      return direct;
    }

    if (record.session && typeof record.session === "object") {
      const nested = record.session as Record<string, unknown>;
      const nestedModel = nested.model ?? nested.modelId ?? nested.model_id;
      if (typeof nestedModel === "string" && nestedModel.trim()) {
        return nestedModel;
      }
    }

    return undefined;
  }

  private extractAssistantChunk(payload: unknown): string | undefined {
    if (!payload || typeof payload !== "object") {
      return undefined;
    }

    const record = payload as Record<string, unknown>;
    const directCandidates = [record.text, record.delta, record.content, record.chunk];
    for (const candidate of directCandidates) {
      if (typeof candidate === "string" && candidate) {
        return candidate;
      }
    }

    if (record.message && typeof record.message === "object") {
      const message = record.message as Record<string, unknown>;
      const role = message.role ?? message.author;
      if (role === "assistant" || role === "model") {
        const messageCandidates = [message.text, message.delta, message.content, message.chunk];
        for (const candidate of messageCandidates) {
          if (typeof candidate === "string" && candidate) {
            return candidate;
          }
        }
      }
    }

    return undefined;
  }

  private stringifyUnknown(value: unknown): string {
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
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
      assumeAuthenticated?: boolean;
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

    if (this.process) {
      this.stop(chatId);
    }

    this.currentChatId = chatId;
    this.status = "starting";
    this.emit({ type: "status", chatId, createdAt: new Date().toISOString(), status: "starting", detail: "Launching Gemini CLI" });

    const runtimeConfig = getRuntimeConfig();
    const args = ["-p", prompt, "--output-format", runtimeConfig.cli.chat.outputFormat, "--skip-trust"];
    if (options?.sessionId) {
      args.push("--resume", options.sessionId);
    }
    if (options?.model) {
      args.push("-m", options.model);
    }
    if (options?.approvalMode) {
      args.push("--approval-mode", options.approvalMode);
    }
    if (options?.sandbox) {
      args.push("--sandbox");
    }

    const executable = this.getResolvedCliPath();
    this.process = this.spawnCli(args, workspacePath);

    this.status = "busy";
    this.emitActivity(chatId, "command", "gemini request", [executable, ...args].join(" "), "running");

    let stdoutBuffer = "";
    let stdoutLineBuffer = "";
    let streamedAssistantText = "";
    let activeCliSessionId = options?.sessionId;
    let activeModel = options?.model;

    this.process.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdoutBuffer += text;
      stdoutLineBuffer += text;
      this.status = "streaming";

      while (stdoutLineBuffer.includes("\n")) {
        const newlineIndex = stdoutLineBuffer.indexOf("\n");
        const line = stdoutLineBuffer.slice(0, newlineIndex).trim();
        stdoutLineBuffer = stdoutLineBuffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }

        try {
          const payload = JSON.parse(line) as Record<string, unknown>;
          const eventType = typeof payload.type === "string" ? payload.type : undefined;

          if (eventType === "init") {
            const sessionId = this.extractSessionId(payload);
            const model = this.extractModel(payload);
            activeCliSessionId = sessionId ?? activeCliSessionId;
            activeModel = model ?? activeModel;
            if (sessionId) {
              this.emit({
                type: "session_initialized",
                chatId,
                createdAt: new Date().toISOString(),
                sessionId,
                model
              });
            }
            continue;
          }

          if (eventType === "message") {
            const assistantChunk = this.extractAssistantChunk(payload);
            if (assistantChunk) {
              streamedAssistantText += assistantChunk;
              this.emit({
                type: "assistant_token",
                chatId,
                createdAt: new Date().toISOString(),
                token: assistantChunk
              });
            }
            continue;
          }

          if (eventType === "tool_use") {
            this.emitActivity(chatId, "command", "Tool call", this.stringifyUnknown(payload), "running");
            continue;
          }

          if (eventType === "tool_result") {
            this.emitActivity(chatId, "stdout", "Tool result", this.stringifyUnknown(payload), "done");
            continue;
          }

          if (eventType === "error") {
            this.emitActivity(chatId, "stderr", "Gemini warning", this.stringifyUnknown(payload), "error");
            continue;
          }

          if (eventType === "result") {
            const response = typeof payload.response === "string" ? payload.response : undefined;
            const stats = payload.stats;
            activeCliSessionId = this.extractSessionId(payload) ?? activeCliSessionId;
            activeModel = this.extractModel(payload) ?? activeModel;

            if (response && !streamedAssistantText) {
              this.emit({
                type: "assistant_token",
                chatId,
                createdAt: new Date().toISOString(),
                token: response
              });
            }

            this.emit({
              type: "run_summary",
              chatId,
              createdAt: new Date().toISOString(),
              sessionId: activeCliSessionId,
              model: activeModel,
              response,
              stats
            });
            this.emitActivity(chatId, "status", "Structured response", this.summarizeStructuredPayload({ response, stats, error: payload.error }), "done");
          }
        } catch {
          this.emitActivity(chatId, "stdout", "Gemini output", line, "done");
        }
      }
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      this.emitActivity(chatId, "stderr", "stderr", text, "error");
    });

    this.process.on("close", (code) => {
      const createdAt = new Date().toISOString();
      if (code === 0) {
        const remainder = stdoutLineBuffer.trim();
        if (remainder) {
          this.emitActivity(chatId, "stdout", "Gemini output", remainder, "done");
        }

        this.status = "connected";
        this.emitActivity(chatId, "status", "Gemini CLI finished", `Exit code ${code}`, "done");
        this.emit({ type: "status", chatId, createdAt, status: "connected", detail: "Gemini CLI finished" });
        this.emit({ type: "completed", chatId, createdAt });
      } else {
        this.status = "error";
        this.emit({
          type: "error",
          chatId,
          createdAt,
          message: `Gemini CLI exited with code ${code ?? -1}.`
        });
      }
      this.process = null;
      this.currentChatId = null;
    });
  }

  stop(chatId?: string): void {
    if (!this.process) {
      return;
    }
    const effectiveChatId = chatId ?? this.currentChatId ?? "unknown";
    this.process.kill();
    this.status = "stopped";
    this.emitActivity(effectiveChatId, "status", "Generation stopped", "The active Gemini CLI process was terminated.", "done");
    this.emit({
      type: "status",
      chatId: effectiveChatId,
      createdAt: new Date().toISOString(),
      status: "stopped",
      detail: "Generation stopped by user"
    });
    this.process = null;
    this.currentChatId = null;
  }

  shutdown(): void {
    this.stop();
  }
}
