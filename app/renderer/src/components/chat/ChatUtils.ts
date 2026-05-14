import { MessageAttachment, PendingAttachment } from "@shared/types";
import hljs from "highlight.js";

export function formatClock(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatRelativeTime(value: string, now: number): string {
  const diffMs = Math.max(0, now - new Date(value).getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return new Date(value).toLocaleDateString();
}

export function formatElapsed(durationMs?: number, startAt?: string, tick?: number): string {
  if (durationMs !== undefined) {
    const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes === 0 ? `${seconds}s` : `${minutes}m ${seconds}s`;
  }

  if (!startAt || !tick) {
    return "0s";
  }

  const started = new Date(startAt).getTime();
  const totalSeconds = Math.max(0, Math.floor((tick - started) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function createAttachmentId(): string {
  return `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getAttachmentPreviewSrc(attachment: MessageAttachment | PendingAttachment): string | undefined {
  if (attachment.previewUrl) {
    if (attachment.previewUrl.startsWith("file://")) {
      return attachment.previewUrl.replace("file://", "gemini-file://");
    }
    return attachment.previewUrl;
  }
  
  if ("storagePath" in attachment && attachment.storagePath) {
    const normalizedPath = attachment.storagePath.replace(/\\/g, "/");
    return `gemini-file:///${normalizedPath}`;
  }
  
  return undefined;
}

export function isImageAttachment(attachment: MessageAttachment | PendingAttachment): boolean {
  return attachment.kind === "image" || attachment.mimeType.startsWith("image/");
}

export async function fileToPendingAttachment(file: File): Promise<PendingAttachment> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment."));
    reader.readAsDataURL(file);
  });

  const commaIndex = dataUrl.indexOf(",");
  const dataBase64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const mimeType = file.type || "application/octet-stream";
  return {
    id: createAttachmentId(),
    kind: mimeType.startsWith("image/") ? "image" : "file",
    name: file.name || "attachment",
    mimeType,
    size: file.size,
    dataBase64,
    previewUrl: mimeType.startsWith("image/") ? dataUrl : undefined
  };
}

export function inferCodeLanguageFromPath(filePath: string): string | undefined {
  const extension = filePath.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
      return "javascript";
    case "py":
      return "python";
    case "cs":
      return "csharp";
    case "json":
      return "json";
    case "css":
      return "css";
    case "html":
      return "xml";
    case "md":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
      return "bash";
    case "ps1":
      return "powershell";
    default:
      return undefined;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function highlightDiffLine(line: string, language?: string): { prefix: string; html: string; tone: "addition" | "deletion" | "context" } {
  const prefix = line.startsWith("+") || line.startsWith("-") ? line[0] : " ";
  const content = prefix === " " ? line : line.slice(1);
  let html = escapeHtml(content);

  try {
    if (language && hljs.getLanguage(language)) {
      html = hljs.highlight(content, { language, ignoreIllegals: true }).value;
    } else {
      html = hljs.highlightAuto(content).value;
    }
  } catch {
    html = escapeHtml(content);
  }

  return {
    prefix,
    html,
    tone: prefix === "+" ? "addition" : prefix === "-" ? "deletion" : "context"
  };
}

export type RenderableDiffLine =
  | {
      type: "line";
      key: string;
      prefix: string;
      html: string;
      tone: "addition" | "deletion" | "context";
      oldLine: number | null;
      newLine: number | null;
    }
  | {
      type: "gap";
      key: string;
      hiddenCount: number;
    };

export function buildRenderableDiffLines(diffPreview: string, language?: string): RenderableDiffLine[] {
  const rawLines = (diffPreview || "(No preview available)").split("\n");
  const parsed = rawLines.map((line, index) => {
    const highlighted = highlightDiffLine(line, language);
    return {
      index,
      ...highlighted
    };
  });

  const changedIndexes = parsed
    .filter((line) => line.tone !== "context")
    .map((line) => line.index);

  const visibleIndexes = new Set<number>();
  if (changedIndexes.length === 0) {
    parsed.forEach((line) => visibleIndexes.add(line.index));
  } else {
    for (const changedIndex of changedIndexes) {
      for (let i = Math.max(0, changedIndex - 5); i <= Math.min(parsed.length - 1, changedIndex + 5); i += 1) {
        visibleIndexes.add(i);
      }
    }
  }

  const result: RenderableDiffLine[] = [];
  let oldLineNumber = 1;
  let newLineNumber = 1;
  let index = 0;

  while (index < parsed.length) {
    if (!visibleIndexes.has(index)) {
      const gapStart = index;
      while (index < parsed.length && !visibleIndexes.has(index)) {
        const tone = parsed[index].tone;
        if (tone !== "addition") {
          oldLineNumber += 1;
        }
        if (tone !== "deletion") {
          newLineNumber += 1;
        }
        index += 1;
      }
      result.push({
        type: "gap",
        key: `gap-${gapStart}`,
        hiddenCount: index - gapStart
      });
      continue;
    }

    const line = parsed[index];
    const oldLine = line.tone === "addition" ? null : oldLineNumber;
    const newLine = line.tone === "deletion" ? null : newLineNumber;
    result.push({
      type: "line",
      key: `line-${index}`,
      prefix: line.prefix,
      html: line.html,
      tone: line.tone,
      oldLine,
      newLine
    });

    if (line.tone !== "addition") {
      oldLineNumber += 1;
    }
    if (line.tone !== "deletion") {
      newLineNumber += 1;
    }
    index += 1;
  }

  return result;
}
