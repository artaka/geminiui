import { ChildProcessWithoutNullStreams } from "node:child_process";

export const ACP_METHODS = {
  fsReadTextFile: "fs/read_text_file",
  fsWriteTextFile: "fs/write_text_file",
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

export type AcpPendingRequest = {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

export type AcpProcessState = {
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
  currentAssistantText: string;
  assistantReplayHistory?: string[];
  assistantReplayCandidate?: {
    messageIndex: number;
    offset: number;
    confirmed: boolean;
    pendingText: string;
  };
  assistantReplayActive: boolean;
  lastReasoningActivityId?: string;
  lastReasoningChunk?: string;
  reasoningSequence: number;
  startTime?: number;
};
