export type AuthState = "signed_out" | "signed_in" | "expired";

export type CliStatus =
  | "starting"
  | "connected"
  | "busy"
  | "streaming"
  | "stopped"
  | "error";

export interface UserSession {
  name: string;
  email: string;
  avatarUrl?: string;
  authState: AuthState;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  lastOpenedAt: string;
  lastUsedModel?: string;
  isMissing?: boolean;
}

export type ApprovalMode = "default" | "auto_edit" | "yolo" | "plan";
export type SandboxMode = "off" | "auto" | "force";

export interface ChatUsageSnapshot {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  lastUpdatedAt?: string;
}

export interface ChatSession {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  cliSessionId?: string;
  cliSessionTransport?: "acp";
  model: string;
  approvalMode: ApprovalMode;
  sandbox: boolean;
  usage: ChatUsageSnapshot;
}

export type MessageRole = "user" | "assistant";
export type MessageStatus = "done" | "streaming" | "error";

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
  durationMs?: number;
}

export type CliActivityKind = "status" | "command" | "stdout" | "stderr" | "error";
export type CliActivityStatus = "running" | "done" | "error";

export interface CliActivity {
  id: string;
  chatId: string;
  messageId?: string;
  kind: CliActivityKind;
  title: string;
  body: string;
  status: CliActivityStatus;
  createdAt: string;
}

export interface ChatSessionPayload {
  session: ChatSession;
  messages: Message[];
  activities: CliActivity[];
}

export interface CliEventBase {
  chatId: string;
  createdAt: string;
}

export type CliEvent =
  | (CliEventBase & { type: "status"; status: CliStatus; detail?: string })
  | (CliEventBase & { type: "assistant_token"; token: string; messageId?: string })
  | (CliEventBase & { type: "activity"; activity: CliActivity; messageId?: string })
  | (CliEventBase & { type: "session_initialized"; sessionId: string; model?: string })
  | (CliEventBase & { type: "run_summary"; sessionId?: string; model?: string; response?: string; stats?: unknown })
  | (CliEventBase & { type: "completed"; messageId?: string; durationMs?: number })
  | (CliEventBase & { type: "error"; message: string; messageId?: string });

export interface AppSettings {
  theme: "dark-codex";
  density: "compact" | "comfortable";
  cliPath: string;
  preferredModel: string;
  preferredApprovalMode: ApprovalMode;
  preferredSandbox: boolean;
  preferredSandboxMode: SandboxMode;
  manualAuthConfirmed?: boolean;
  missingCliOnboardingShown?: boolean;
  activeWorkspaceId?: string;
  activeChatId?: string;
}

export interface PersistedAppData {
  settings: AppSettings;
  workspaces: Workspace[];
  chats: ChatSession[];
  messages: Message[];
  activities: CliActivity[];
}

export interface DiagnosticsSnapshot {
  appVersion: string;
  electronVersion: string;
  cliStatus: CliStatus;
  cliPath: string;
  authState: AuthState;
  activeWorkspacePath?: string;
}

export interface CliHealth {
  installed: boolean;
  authenticated: boolean;
  path: string;
  status: CliStatus;
  version?: string;
  message: string;
  warnings?: string[];
}

export interface RuntimeModelOption {
  id: string;
  label: string;
}

export interface EnvironmentDependencyStatus {
  id: string;
  name: string;
  required: boolean;
  installed: boolean;
  installHint: string;
  message: string;
}

export interface EnvironmentStatus {
  dependencies: EnvironmentDependencyStatus[];
}
