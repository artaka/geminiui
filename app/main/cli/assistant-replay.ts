import { AcpProcessState } from "./types";

export const ASSISTANT_REPLAY_CONFIRM_CHARS = 256;
export const ASSISTANT_REPLAY_MAX_MESSAGES = 8;
export const ASSISTANT_REPLAY_MAX_PENDING_CHARS = 8192;

export function advanceAssistantReplayCandidate(
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

export function findAssistantReplayCandidate(history: string[], chunk: string): AcpProcessState["assistantReplayCandidate"] {
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

export function stripAssistantReplay(state: AcpProcessState, chunk: string): string {
  const history = state.assistantReplayHistory;
  if (!state.assistantReplayActive || !history || history.length === 0 || !chunk) {
    return chunk;
  }

  let candidate = state.assistantReplayCandidate;
  if (!candidate) {
    candidate = findAssistantReplayCandidate(history, chunk);
    if (!candidate) {
      state.assistantReplayActive = false;
      return chunk;
    }
    state.assistantReplayCandidate = candidate;
  }

  const result = advanceAssistantReplayCandidate(history, candidate, chunk);
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

export function getAssistantChunkDelta(state: AcpProcessState, chunk: string): string {
  let currentChunk = stripAssistantReplay(state, chunk);
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
