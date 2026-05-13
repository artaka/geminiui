import path from "node:path";

export function safeStringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function extractTextFromAcpContent(content: unknown): string {
  if (!content || typeof content !== "object") {
    return "";
  }

  const record = content as Record<string, unknown>;
  if (record.thought === true) {
    return "";
  }

  const directType = record.type;
  if (directType === "text" && typeof record.text === "string") {
    return record.text;
  }

  if (directType === "content" && record.content && typeof record.content === "object") {
    const nested = record.content as Record<string, unknown>;
    if (nested.thought === true) {
      return "";
    }
    if (nested.type === "text" && typeof nested.text === "string") {
      return nested.text;
    }
  }

  return "";
}

export function parseRpcError(errorPayload: unknown, fallbackMessage: string): Error {
  if (!errorPayload || typeof errorPayload !== "object") {
    return new Error(fallbackMessage);
  }
  const errorRecord = errorPayload as Record<string, unknown>;
  const message = typeof errorRecord.message === "string" ? errorRecord.message : fallbackMessage;
  const details = errorRecord.data && typeof errorRecord.data === "object" ? (errorRecord.data as Record<string, unknown>).details : undefined;
  return new Error(typeof details === "string" && details ? `${message}: ${details}` : message);
}

export function readTextFileSlice(content: string, line?: number, limit?: number): string {
  if (!line && !limit) {
    return content;
  }

  const normalizedLine = Math.max(1, Math.trunc(line ?? 1));
  const normalizedLimit = limit === undefined ? undefined : Math.max(0, Math.trunc(limit));
  const lines = content.split(/\r?\n/);
  const startIndex = Math.min(lines.length, normalizedLine - 1);
  const endIndex = normalizedLimit === undefined ? lines.length : Math.min(lines.length, startIndex + normalizedLimit);
  return lines.slice(startIndex, endIndex).join("\n");
}

export function resolveWorkspaceFilePath(workspacePath: string, candidatePath: unknown): string {
  if (typeof candidatePath !== "string" || !candidatePath.trim()) {
    throw new Error("Missing file path.");
  }

  const workspaceRoot = path.resolve(workspacePath);
  const resolvedPath = path.resolve(path.isAbsolute(candidatePath) ? candidatePath : path.join(workspaceRoot, candidatePath));
  const relativePath = path.relative(workspaceRoot, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Path is outside of the active workspace: ${candidatePath}`);
  }

  return resolvedPath;
}
