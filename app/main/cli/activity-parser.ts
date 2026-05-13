import { CliActivity } from "../../shared/types";
import { extractTextFromAcpContent, safeStringify } from "./utils";

export function mapAcpToolStatus(status: unknown): CliActivity["status"] {
  if (status === "failed") {
    return "error";
  }
  if (status === "completed") {
    return "done";
  }
  return "running";
}

export function mapAcpToolKind(kind: unknown): CliActivity["kind"] {
  if (kind === "execute") {
    return "command";
  }
  if (kind === "fetch" || kind === "read" || kind === "search" || kind === "think") {
    return "stdout";
  }
  return "command";
}

export function looksLikePath(value: string): boolean {
  return (
    value.includes("/") ||
    value.includes("\\") ||
    /\.(ts|tsx|js|jsx|json|md|txt|css|html|cs|py|java|kt|swift|go|rs|cpp|c|h|hpp|yml|yaml|xml|sh|ps1)$/i.test(value)
  );
}

export function collectStringValues(value: unknown, keys: string[]): string[] {
  const found: string[] = [];

  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") {
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
      return;
    }

    const record = candidate as Record<string, unknown>;
    for (const key of keys) {
      const direct = record[key];
      if (typeof direct === "string" && direct.trim()) {
        found.push(direct.trim());
      } else if (Array.isArray(direct)) {
        for (const item of direct) {
          if (typeof item === "string" && item.trim()) {
            found.push(item.trim());
          }
        }
      }
    }

    for (const nested of Object.values(record)) {
      if (nested && typeof nested === "object") {
        visit(nested);
      }
    }
  };

  visit(value);
  return [...new Set(found)];
}

export function flattenAcpText(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenAcpText(item));
  }
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const direct = extractTextFromAcpContent(record);
  const textValues = [direct];

  for (const key of ["text", "summary", "reason", "details", "body", "message"]) {
    const candidate = record[key];
    if (typeof candidate === "string") {
      textValues.push(candidate);
    }
  }

  return textValues.map((item) => item.trim()).filter(Boolean);
}

export function extractTargetFromAcpUpdate(update: Record<string, unknown>): string | undefined {
  const locationTexts = collectStringValues(update.locations, ["path", "uri", "file_path", "dir_path", "url"]);
  const inputTexts = collectStringValues(update.rawInput, ["file_path", "dir_path", "path", "pattern", "url", "command"]);
  const outputTexts = collectStringValues(update.rawOutput, ["file_path", "dir_path", "path", "url", "command"]);
  const candidates = [...locationTexts, ...inputTexts, ...outputTexts];
  return candidates.find((candidate) => looksLikePath(candidate));
}

export function sanitizeReasonText(text: string): string {
  return text
    .replace(/\[Thought:\s*true\]/gi, "")
    .replace(/^\s*\[![^\]]+\]\s*$/gim, "")
    .trim();
}

export function extractTopicSuggestion(update: Record<string, unknown>): string | undefined {
  const text = [
    ...flattenAcpText(update.content),
    safeStringify(update.rawInput),
    safeStringify(update.rawOutput)
  ]
    .filter(Boolean)
    .join("\n");

  const directMatch = text.match(/Update topic to:\s*["“”]?(.+?)["“”]?(?:\r?\n|$)/i);
  if (directMatch?.[1]?.trim()) {
    return directMatch[1].trim();
  }

  const match = text.match(/Topic:\s*\*{0,2}(.+?)\*{0,2}(?:\r?\n|$)/i);
  return match?.[1]?.trim();
}

export function extractReasonFromAcpUpdate(update: Record<string, unknown>): string | undefined {
  const contentTexts = flattenAcpText(update.content);
  const preferred = contentTexts
    .map((item) => sanitizeReasonText(item))
    .find((item) => item && !/^kind:\s|^status:\s/i.test(item));

  if (preferred) {
    return preferred;
  }

  const rawOutputTexts = flattenAcpText(update.rawOutput);
  return rawOutputTexts.map((item) => sanitizeReasonText(item)).find(Boolean);
}

export function renderAcpToolBody(update: Record<string, unknown>): string {
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
    parts.push(`locations: ${safeStringify(locations)}`);
  }

  const content = Array.isArray(update.content) ? update.content : [];
  if (content.length > 0) {
    const renderedContent = content
      .map((item) => extractTextFromAcpContent(item) || safeStringify(item))
      .filter(Boolean)
      .join("\n");
    if (renderedContent) {
      parts.push(renderedContent);
    }
  }

  if (update.rawInput !== undefined) {
    parts.push(`rawInput: safeStringify(update.rawInput)`);
  }
  if (update.rawOutput !== undefined) {
    parts.push(`rawOutput: safeStringify(update.rawOutput)`);
  }

  return parts.join("\n");
}

export function normalizeAcpActivity(update: Record<string, unknown>): {
  kind: CliActivity["kind"];
  status: CliActivity["status"];
  title: string;
  body: string;
  tone?: CliActivity["tone"];
  target?: string;
  reason?: string;
  details?: string;
  toolKind?: string;
  suggestedChatTitle?: string;
} {
  const toolKind = typeof update.kind === "string" ? update.kind : undefined;
  const title = typeof update.title === "string" && update.title.trim() ? update.title.trim() : "Tool call";
  const status = mapAcpToolStatus(update.status);
  const body = renderAcpToolBody(update);
  const target = extractTargetFromAcpUpdate(update);
  const reason = extractReasonFromAcpUpdate(update);
  const suggestedChatTitle = /update topic/i.test(title) || /update topic/i.test(body) ? extractTopicSuggestion(update) : undefined;

  if (toolKind === "think") {
    return {
      kind: "stdout",
      status,
      title: "Thinking",
      body,
      tone: "reasoning",
      target,
      reason,
      details: body,
      toolKind,
      suggestedChatTitle
    };
  }

  const normalizedTitle = title.toLowerCase();
  if (toolKind === "read" || normalizedTitle.includes("readfile") || normalizedTitle.includes("readfolder") || normalizedTitle.includes("readmanyfiles")) {
    return {
      kind: "stdout",
      status,
      title: normalizedTitle.includes("folder") ? "Reading Folder" : normalizedTitle.includes("many") ? "Reading Files" : "Reading File",
      body,
      tone: "read",
      target,
      reason,
      details: body,
      toolKind,
      suggestedChatTitle
    };
  }

  if (toolKind === "search" || normalizedTitle.includes("findfiles") || normalizedTitle.includes("grep") || normalizedTitle.includes("search")) {
    return {
      kind: "stdout",
      status,
      title: "Searching",
      body,
      tone: "search",
      target,
      reason,
      details: body,
      toolKind,
      suggestedChatTitle
    };
  }

  if (toolKind === "fetch") {
    return {
      kind: "stdout",
      status,
      title: "Fetching Resource",
      body,
      tone: "fetch",
      target,
      reason,
      details: body,
      toolKind,
      suggestedChatTitle
    };
  }

  if (toolKind === "execute") {
    return {
      kind: "command",
      status,
      title: "Running Command",
      body,
      tone: "execute",
      target: target ?? collectStringValues(update.rawInput, ["command"]).find(Boolean),
      reason,
      details: body,
      toolKind,
      suggestedChatTitle
    };
  }

  if (toolKind === "edit" || normalizedTitle.includes("writefile") || normalizedTitle.startsWith("writing to ")) {
    const rawOutput = safeStringify(update.rawOutput);
    const writesNewFile = /created and wrote to new file|created new file|successfully created/i.test(rawOutput);
    return {
      kind: "command",
      status,
      title: normalizedTitle.startsWith("writing to ") ? title : writesNewFile ? "Creating File" : "Writing File",
      body,
      tone: toolKind === "edit" ? "edit" : "write",
      target,
      reason,
      details: body,
      toolKind,
      suggestedChatTitle
    };
  }

  if (normalizedTitle.includes("replace")) {
    return {
      kind: "command",
      status,
      title: "Editing File",
      body,
      tone: "edit",
      target,
      reason,
      details: body,
      toolKind,
      suggestedChatTitle
    };
  }

  return {
    kind: mapAcpToolKind(toolKind),
    status,
    title,
    body,
    tone: toolKind === "read" ? "read" : toolKind === "search" ? "search" : toolKind === "fetch" ? "fetch" : toolKind === "execute" ? "execute" : "status",
    target,
    reason,
    details: body,
    toolKind,
    suggestedChatTitle
  };
}
