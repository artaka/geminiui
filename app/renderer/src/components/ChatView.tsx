import { memo, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js";
import { ChatSession, CliActivity, FileChangeEntry, FileChangeSet, Message } from "@shared/types";
import { useAppStore } from "../store";
import { CustomDropdown, DropdownOption } from "./CustomDropdown";

function formatClock(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(durationMs?: number, startAt?: string, tick?: number): string {
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

function renderInlineRichText(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(!?\[([^\]]+)\]\(([^)]+)\)|<((?:https?:\/\/|mailto:)[^>]+)>|`([^`]+)`|\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]?.startsWith("![") && match[2] && match[3]) {
      const src = match[3];
      nodes.push(<img key={`${keyPrefix}-img-${match.index}`} className="inline-image" src={src} alt={match[2]} />);
    } else if (match[2] && match[3]) {
      const href = match[3];
      nodes.push(
        <a key={`${keyPrefix}-link-${match.index}`} className="inline-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {renderInlineRichText(match[2], `${keyPrefix}-linktext-${match.index}`)}
        </a>
      );
    } else if (match[4]) {
      const href = match[4];
      nodes.push(
        <a key={`${keyPrefix}-autolink-${match.index}`} className="inline-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {href}
        </a>
      );
    } else if (match[5]) {
      nodes.push(
        <code key={`${keyPrefix}-code-${match.index}`} className="inline-code">
          {match[5]}
        </code>
      );
    } else if (match[6] || match[7]) {
      const content = match[6] ?? match[7] ?? "";
      nodes.push(
        <strong key={`${keyPrefix}-strongem-${match.index}`}>
          <em>{renderInlineRichText(content, `${keyPrefix}-strongem-${match.index}`)}</em>
        </strong>
      );
    } else if (match[8] || match[9]) {
      const content = match[8] ?? match[9] ?? "";
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{renderInlineRichText(content, `${keyPrefix}-strong-${match.index}`)}</strong>);
    } else if (match[10]) {
      nodes.push(<del key={`${keyPrefix}-del-${match.index}`}>{renderInlineRichText(match[10], `${keyPrefix}-del-${match.index}`)}</del>);
    } else if (match[11] || match[12]) {
      const content = match[11] ?? match[12] ?? "";
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{renderInlineRichText(content, `${keyPrefix}-em-${match.index}`)}</em>);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function InlineRichText(props: { text: string }) {
  return <>{renderInlineRichText(props.text, "inline")}</>;
}

function inferCodeLanguageFromPath(filePath: string): string | undefined {
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightDiffLine(line: string, language?: string): { prefix: string; html: string; tone: "addition" | "deletion" | "context" } {
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

type RenderableDiffLine =
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

function buildRenderableDiffLines(diffPreview: string, language?: string): RenderableDiffLine[] {
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

const DiffPreview = memo(function DiffPreview(props: { file: FileChangeEntry }) {
  const language = useMemo(() => inferCodeLanguageFromPath(props.file.path), [props.file.path]);
  const lines = useMemo(() => buildRenderableDiffLines(props.file.diffPreview || "(No preview available)", language), [props.file.diffPreview, language]);

  return (
    <pre className="change-file-diff">
      <code className="hljs diff-code">
        {lines.map((line) =>
          line.type === "gap" ? (
            <div key={line.key} className="diff-gap">
              <span className="diff-line-number">...</span>
              <span className="diff-line-number">...</span>
              <span className="diff-gap-text">Skipped {line.hiddenCount} unchanged lines</span>
            </div>
          ) : (
            <div key={line.key} className={`diff-line ${line.tone}`}>
              <span className="diff-line-number">{line.oldLine ?? ""}</span>
              <span className="diff-line-number">{line.newLine ?? ""}</span>
              <span className={`diff-prefix ${line.tone}`}>{line.prefix}</span>
              <span className="diff-line-code" dangerouslySetInnerHTML={{ __html: line.html || "&nbsp;" }} />
            </div>
          )
        )}
      </code>
    </pre>
  );
});

const RichTextMessage = memo(function RichTextMessage(props: { text: string }) {
  const normalized = props.text.replace(/\r\n/g, "\n");
  const segments = normalized.split(/```/g);
  const blocks: ReactNode[] = [];

  const pushTextBlock = (textBlock: string, keyPrefix: string) => {
    const lines = textBlock.split("\n");
    const localBlocks: ReactNode[] = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index].trimEnd();
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        index += 1;
        continue;
      }

      if (trimmedLine.startsWith("#")) {
        const level = Math.min(3, trimmedLine.match(/^#+/)?.[0].length ?? 1);
        const content = trimmedLine.replace(/^#+\s*/, "");
        const Tag = `h${level}` as "h1" | "h2" | "h3";
        localBlocks.push(
          <Tag key={`${keyPrefix}-heading-${index}`} className="rich-heading">
            <InlineRichText text={content} />
          </Tag>
        );
        index += 1;
        continue;
      }

      if (/^([-*_])(?:\s*\1){2,}\s*$/.test(trimmedLine)) {
        localBlocks.push(<hr key={`${keyPrefix}-hr-${index}`} className="rich-divider" />);
        index += 1;
        continue;
      }

      if (/^[-*]\s+/.test(trimmedLine)) {
        const items: Array<{ text: string; checked?: boolean }> = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
          const itemText = lines[index].trim().replace(/^[-*]\s+/, "");
          const taskMatch = itemText.match(/^\[( |x|X)\]\s+(.*)$/);
          items.push(taskMatch ? { text: taskMatch[2], checked: taskMatch[1].toLowerCase() === "x" } : { text: itemText });
          index += 1;
        }
        localBlocks.push(
          <ul key={`${keyPrefix}-list-${index}`} className="rich-list">
            {items.map((item, itemIndex) => (
              <li key={`${keyPrefix}-li-${itemIndex}`}>
                {typeof item.checked === "boolean" ? <input className="task-checkbox" type="checkbox" checked={item.checked} readOnly /> : null}
                <InlineRichText text={item.text} />
              </li>
            ))}
          </ul>
        );
        continue;
      }

      if (/^\d+\.\s+/.test(trimmedLine)) {
        const items: string[] = [];
        while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
          items.push(lines[index].trim().replace(/^\d+\.\s+/, ""));
          index += 1;
        }
        localBlocks.push(
          <ol key={`${keyPrefix}-olist-${index}`} className="rich-list rich-list-ordered">
            {items.map((item, itemIndex) => (
              <li key={`${keyPrefix}-oli-${itemIndex}`}>
                <InlineRichText text={item} />
              </li>
            ))}
          </ol>
        );
        continue;
      }

      if (trimmedLine.startsWith(">")) {
        const quotes: string[] = [];
        while (index < lines.length && lines[index].trim().startsWith(">")) {
          quotes.push(lines[index].trim().replace(/^>\s?/, ""));
          index += 1;
        }
        localBlocks.push(
          <blockquote key={`${keyPrefix}-quote-${index}`} className="rich-quote">
            <InlineRichText text={quotes.join(" ")} />
          </blockquote>
        );
        continue;
      }

      const paragraph: string[] = [];
      while (index < lines.length) {
        const current = lines[index].trimEnd();
        const trimmed = current.trim();
        if (!trimmed || trimmed.startsWith("#") || /^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed) || trimmed.startsWith(">")) {
          break;
        }
        paragraph.push(trimmed);
        index += 1;
      }
      localBlocks.push(
        <p key={`${keyPrefix}-paragraph-${index}`} className="rich-paragraph">
          <InlineRichText text={paragraph.join(" ")} />
        </p>
      );

    }

    blocks.push(...localBlocks);
  };

  segments.forEach((segment, segmentIndex) => {
    if (segmentIndex % 2 === 1) {
      const [language, ...bodyLines] = segment.split("\n");
      const body = bodyLines.length > 0 ? bodyLines.join("\n") : language;
      const codeLanguage = bodyLines.length > 0 ? language.trim() : "";
      const normalizedLanguage = codeLanguage.toLowerCase();

      let highlightedCode = "";
      try {
        if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
          highlightedCode = hljs.highlight(body.trim(), { language: normalizedLanguage, ignoreIllegals: true }).value;
        } else {
          highlightedCode = body.trim()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }
      } catch (e) {
        highlightedCode = body.trim();
      }

      blocks.push(
        <div key={`code-${segmentIndex}`} className="rich-code-block">
          <div className="rich-code-header">
            <div className="rich-code-label">{codeLanguage || "code"}</div>
            <button className="rich-code-copy" type="button" onClick={() => void navigator.clipboard.writeText(body.trim())} title="Copy code" aria-label="Copy code">
              <ActionIcon name="copy" />
            </button>
          </div>
          <pre>
            <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedCode }} />
          </pre>
        </div>
      );
    } else {
      pushTextBlock(segment, `segment-${segmentIndex}`);
    }
  });

  return <div className="rich-text">{blocks}</div>;
});

function ActivityIcon(props: { activity: CliActivity }) {
  if (props.activity.status === "error" || props.activity.kind === "stderr" || props.activity.kind === "error" || props.activity.tone === "error") {
    return (
      <div className="activity-icon-wrap error">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="8" />
          <line x1="10" y1="8" x2="10" y2="12" />
          <line x1="10" y1="16" x2="10.01" y2="16" />
        </svg>
      </div>
    );
  }

  if (props.activity.status === "running") {
    return (
      <div className="activity-icon-wrap running">
        <div className="activity-spinner" />
      </div>
    );
  }

  const getIcon = () => {
    switch (props.activity.tone) {
      case "reasoning":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
            <path d="M12 6v6l4 2" />
          </svg>
        );
      case "read":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5z" />
            <path d="M8 6h10" />
            <path d="M8 10h10" />
            <path d="M8 14h10" />
          </svg>
        );
      case "search":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        );
      case "write":
      case "edit":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        );
      case "fetch":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        );
      case "execute":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
    }
  };

  return <div className={`activity-icon-wrap ${props.activity.tone ?? "done"}`}>{getIcon()}</div>;
}

function ActivityItem(props: { activity: CliActivity }) {
  const details = props.activity.details ?? props.activity.body;
  const showDetails = details.trim() && details.trim() !== (props.activity.reason ?? "").trim() && details.trim() !== (props.activity.target ?? "").trim();
  const isLong = details.includes("\n") || details.length > 120;
  const prefersMarkdown = props.activity.tone === "reasoning";

  return (
    <div className={`agent-step-v2 ${props.activity.status} tone-${props.activity.tone ?? "default"}`}>
      <div className="agent-step-v2-icon">
        <ActivityIcon activity={props.activity} />
      </div>
      <div className="agent-step-v2-content">
        <div className="agent-step-v2-header">
          <span className="agent-step-v2-title">{props.activity.title}</span>
          {props.activity.target ? <code className="agent-step-v2-target">{props.activity.target}</code> : null}
          <span className="agent-step-v2-spacer" />
          <span className="agent-step-v2-time">{formatClock(props.activity.createdAt)}</span>
        </div>

        {props.activity.reason ? (
          <div className={`agent-step-v2-reason ${prefersMarkdown ? "markdown" : ""}`}>
            {prefersMarkdown ? <RichTextMessage text={props.activity.reason} /> : props.activity.reason}
          </div>
        ) : null}

        {showDetails ? (
          <div className="agent-step-v2-details-wrap">
            {isLong ? (
              <details className="agent-step-v2-details">
                <summary>{props.activity.status === "error" ? "View error details" : "Show output"}</summary>
                <div className="agent-step-v2-details-body">
                  {prefersMarkdown ? <RichTextMessage text={details} /> : <pre>{details}</pre>}
                </div>
              </details>
            ) : (
              <div className="agent-step-v2-meta">
                {prefersMarkdown ? <RichTextMessage text={details} /> : details}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActionIcon(props: { name: "copy" | "retry" | "chevron" | "plus" | "undo" | "open" | "arrow-down" }) {
  switch (props.name) {
    case "copy":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="7" y="4" width="9" height="11" rx="2" />
          <path d="M5 7H4a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2v-1" />
        </svg>
      );
    case "retry":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M15.5 10a5.5 5.5 0 11-1.6-3.9" />
          <path d="M15.5 5.4v4.1h-4.1" />
        </svg>
      );
    case "chevron":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7 5l6 5-6 5" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      );
    case "undo":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7 6H3v4" />
          <path d="M4 10a6 6 0 101.6-4.1L3 8" />
        </svg>
      );
    case "open":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M12 4h4v4" />
          <path d="M11 9l5-5" />
          <path d="M8 4H6a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-2" />
        </svg>
      );
    case "arrow-down":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 3v13" />
          <path d="M4.5 10.5L10 16l5.5-5.5" />
        </svg>
      );
    default:
      return null;
  }
}

function summarizeChangedFiles(changeSet: FileChangeSet): string {
  if (changeSet.fileCount === 1) {
    return "Changed 1 file";
  }
  return `Changed ${changeSet.fileCount} files`;
}

const ChangeSetPanel = memo(function ChangeSetPanel(props: {
  changeSet: FileChangeSet;
  onOpenPath: (filePath: string) => void;
  onRequestRevert: (changeSetId: string, relativePath?: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleFile = (relativePath: string) => {
    setExpanded((current) => ({ ...current, [relativePath]: !current[relativePath] }));
  };

  return (
    <section className="change-set-card">
      <div className="change-set-header">
        <div className="change-set-summary">
          <span>{summarizeChangedFiles(props.changeSet)}</span>
          <span className="diff-stats additions">+{props.changeSet.totalAdditions}</span>
          <span className="diff-stats deletions">-{props.changeSet.totalDeletions}</span>
        </div>
        <div className="change-set-actions">
          <button
            className="change-set-action"
            onClick={() => props.onRequestRevert(props.changeSet.id)}
            disabled={props.changeSet.status === "reverted"}
            title="Revert all files from this agent run"
          >
            <ActionIcon name="undo" />
            <span>Revert</span>
          </button>
        </div>
      </div>

      <div className="change-set-files">
        {props.changeSet.files.map((file) => {
          const isExpanded = expanded[file.relativePath] ?? false;
          return (
            <div key={file.relativePath} className={`change-file-row ${file.state === "reverted" ? "reverted" : ""}`}>
              <button className="change-file-summary" onClick={() => toggleFile(file.relativePath)} aria-expanded={isExpanded}>
                <span className="change-file-path">{file.relativePath}</span>
                <span className={`change-file-kind ${file.kind}`}>{file.kind}</span>
                <span className="diff-stats additions">+{file.additions}</span>
                <span className="diff-stats deletions">-{file.deletions}</span>
                <span className={`chevron-icon ${isExpanded ? "expanded" : ""}`}>
                  <ActionIcon name="chevron" />
                </span>
              </button>

              {isExpanded ? (
                <div className="change-file-details">
                  <div className="change-file-toolbar">
                    <button className="icon-link-button" onClick={() => props.onOpenPath(file.path)} title="Open file" aria-label="Open file">
                      <ActionIcon name="open" />
                    </button>
                    <button
                      className="icon-link-button"
                      onClick={() => props.onRequestRevert(props.changeSet.id, file.relativePath)}
                      disabled={file.state === "reverted"}
                      title={file.state === "reverted" ? "Already reverted" : "Revert this file"}
                      aria-label="Revert this file"
                    >
                      <ActionIcon name="undo" />
                    </button>
                  </div>
                  <DiffPreview file={file} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
});

function UserBubble(props: { message: Message }) {
  return (
    <div className="user-bubble-row">
      <div className="user-bubble">
        <div className="user-bubble-body">{props.message.content}</div>
      </div>
      <div className="user-bubble-actions external">
        <button className="icon-link-button" onClick={() => void navigator.clipboard.writeText(props.message.content)} title="Copy message" aria-label="Copy message">
          <ActionIcon name="copy" />
        </button>
        <span className="muted-text">{formatClock(props.message.createdAt)}</span>
      </div>
    </div>
  );
}

type AccessPreset = "default-permissions" | "auto-review" | "full-access";

function getAccessPreset(session: ChatSession): AccessPreset {
  if (!session.sandbox && session.approvalMode === "yolo") {
    return "full-access";
  }
  if (session.sandbox && session.approvalMode === "auto_edit") {
    return "auto-review";
  }
  return "default-permissions";
}

function getAccessConfig(preset: AccessPreset): Pick<ChatSession, "approvalMode" | "sandbox"> {
  switch (preset) {
    case "full-access":
      return { approvalMode: "yolo", sandbox: false };
    case "auto-review":
      return { approvalMode: "auto_edit", sandbox: true };
    default:
      return { approvalMode: "default", sandbox: false };
  }
}

const ACCESS_PRESET_OPTIONS: DropdownOption[] = [
  { value: "default-permissions", label: "Default permissions" },
  { value: "auto-review", label: "Auto-review" },
  { value: "full-access", label: "Full access" }
];

const AssistantResponse = memo(function AssistantResponse(props: {
  message: Message;
  activities: CliActivity[];
  changeSet?: FileChangeSet;
  isLatest?: boolean;
  isBusy?: boolean;
  tick: number;
  onRegenerate?: (prompt: string) => void;
  lastUserPrompt?: string;
  onOpenPath?: (filePath: string) => void;
  onRequestRevert?: (changeSetId: string, relativePath?: string) => void;
}) {
  const [expanded, setExpanded] = useState(props.isBusy);

  useEffect(() => {
    if (props.isBusy) {
      setExpanded(true);
    } else if (props.isLatest) {
      setExpanded(false);
    }
  }, [props.isBusy, props.isLatest]);

  const runCompleted = props.message.status === "done" || props.message.status === "error";
  const showRunPanel = props.activities.length > 0 || (props.isLatest && props.isBusy);

  return (
    <div className={`assistant-response-group ${props.isLatest ? "latest" : ""}`}>
      {showRunPanel ? (
        <section className="agent-run-wrap">
          <button className="agent-run-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            <span>
              {runCompleted
                ? `Worked for ${formatElapsed(props.message.durationMs)}`
                : `Working for ${formatElapsed(undefined, props.message.createdAt, props.tick)}`}
            </span>
            <span className={`chevron-icon ${expanded ? "expanded" : ""}`}>
              <ActionIcon name="chevron" />
            </span>
          </button>
          {expanded ? (
            <div className="agent-run-panel">
              <div className="agent-run-timeline">
                {props.activities.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
                {props.isLatest && props.isBusy ? (
                  <div className="agent-step running ghost">
                    <div className="agent-step-rail">
                      <span className="activity-dot running" />
                    </div>
                    <div className="agent-step-content">
                      <div className="agent-step-header">
                        <div className="agent-step-title">Generating answer</div>
                        <div className="agent-step-time">Live</div>
                      </div>
                      <div className="agent-step-body">Streaming assistant response into the final answer block.</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className={`assistant-response-block ${props.isLatest ? "latest" : ""} ${props.message.status}`}>
        {props.message.content ? (
          <RichTextMessage text={props.message.content} />
        ) : props.isLatest ? (
          <div className="assistant-placeholder">
            <span className="assistant-placeholder-dot" />
            <span>{props.message.status === "error" ? "The run ended with an error." : "Waiting for the assistant response..."}</span>
          </div>
        ) : null}
        {props.changeSet && props.onOpenPath && props.onRequestRevert ? (
          <ChangeSetPanel changeSet={props.changeSet} onOpenPath={props.onOpenPath} onRequestRevert={props.onRequestRevert} />
        ) : null}
        <div className="assistant-response-toolbar">
          <div className="assistant-response-actions">
            <button
              className="icon-link-button"
              onClick={() => void navigator.clipboard.writeText(props.message.content)}
              disabled={!props.message.content}
              title="Copy answer"
              aria-label="Copy answer"
            >
              <ActionIcon name="copy" />
            </button>
            {props.isLatest && props.lastUserPrompt && props.onRegenerate ? (
              <button
                className="icon-link-button"
                onClick={() => props.onRegenerate?.(props.lastUserPrompt!)}
                disabled={props.isBusy}
                title="Regenerate answer"
                aria-label="Regenerate answer"
              >
                <ActionIcon name="retry" />
              </button>
            ) : null}
          </div>
          <div className="assistant-response-meta">{formatClock(props.message.createdAt)}</div>
        </div>
      </div>
    </div>
  );
});

export function ChatView() {
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const activeChat = useAppStore((state) => state.activeChat);
  const cliStatus = useAppStore((state) => state.cliStatus);
  const activeRunChatId = useAppStore((state) => state.activeRunChatId);
  const settings = useAppStore((state) => state.settings);
  const environment = useAppStore((state) => state.environment);
  const models = useAppStore((state) => state.models);
  const updateChat = useAppStore((state) => state.updateChat);
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const createChat = useAppStore((state) => state.createChat);
  const sendPrompt = useAppStore((state) => state.sendPrompt);
  const stopPrompt = useAppStore((state) => state.stopPrompt);
  const openChat = useAppStore((state) => state.openChat);
  const revertChangeSet = useAppStore((state) => state.revertChangeSet);
  const openPath = useAppStore((state) => state.openPath);
  const [prompt, setPrompt] = useState("");
  const [tick, setTick] = useState(Date.now());
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true);
  const [revertTarget, setRevertTarget] = useState<{ changeSetId: string; relativePath?: string } | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);

  const isGlobalBusy = cliStatus === "starting" || cliStatus === "streaming" || cliStatus === "busy";
  const isBusy = isGlobalBusy && (!activeRunChatId || activeRunChatId === activeChat?.session.id);
  const isBlockedByOtherChat = isGlobalBusy && Boolean(activeRunChatId && activeRunChatId !== activeChat?.session.id);

  useEffect(() => {
    if (!isBusy) {
      return;
    }

    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isBusy]);

  const handleSend = () => {
    const value = prompt.trim();
    if (!value || isGlobalBusy) {
      return;
    }
    void sendPrompt(value);
    setPrompt("");
  };

  const chatMessages = activeChat?.messages ?? [];
  const chatActivities = activeChat?.activities ?? [];
  const chatChangeSets = activeChat?.changeSets ?? [];

  const groupedActivities = useMemo(() => {
    const map = new Map<string, CliActivity[]>();
    for (const activity of chatActivities) {
      if (!activity.messageId) continue;
      if (!map.has(activity.messageId)) {
        map.set(activity.messageId, []);
      }
      map.get(activity.messageId)!.push(activity);
    }
    return map;
  }, [chatActivities]);

  const changeSetMap = useMemo(() => {
    const map = new Map<string, FileChangeSet>();
    for (const changeSet of chatChangeSets) {
      map.set(changeSet.id, changeSet);
    }
    return map;
  }, [chatChangeSets]);

  const lastUserPrompt = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === "user") return chatMessages[i].content;
    }
    return undefined;
  }, [chatMessages]);

  const isEmptyChat = chatMessages.length === 0;
  const totalChars = chatMessages.reduce((sum, message) => sum + message.content.length, 0);
  const estimatedTokens = Math.max(1, Math.round(totalChars / 4));
  const contextLimit = 128000;
  const contextRatio = Math.min(1, estimatedTokens / contextLimit);
  const requestCount = activeChat?.session.usage.requestCount ?? 0;
  const totalUsedTokens = activeChat?.session.usage.totalTokens ?? 0;
  const currentModel = activeChat?.session.model ?? settings?.preferredModel ?? "auto";
  const currentAccessPreset = activeChat ? getAccessPreset(activeChat.session) : "default-permissions";

  const lastMessageId = chatMessages[chatMessages.length - 1]?.id;
  const lastMessageContent = chatMessages[chatMessages.length - 1]?.content;

  const updateScrollState = useCallback(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setIsScrolledToBottom(distanceToBottom < 80);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }
    container.scrollTo({ top: container.scrollHeight, behavior });
    setIsScrolledToBottom(true);
  }, []);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }
    container.addEventListener("scroll", updateScrollState, { passive: true });
    updateScrollState();
    return () => container.removeEventListener("scroll", updateScrollState);
  }, [updateScrollState, activeChat?.session.id]);

  useEffect(() => {
    scrollToBottom("auto");
  }, [activeChat?.session.id, scrollToBottom]);

  useEffect(() => {
    if (!isScrolledToBottom) {
      return;
    }
    scrollToBottom("auto");
  }, [lastMessageId, lastMessageContent, isScrolledToBottom, scrollToBottom]);

  if (!activeWorkspace) {
    return (
      <div className="empty-chat-state">
        <div className="empty-state-card">
          <div className="eyebrow">Workspace</div>
          <div className="hero-title">Choose a workspace to start working in GeminiApp.</div>
          <p className="empty-state-copy">The app keeps chats attached to a selected folder, so pick a project first and then start the conversation.</p>
          <button className="cta-button" onClick={() => void addWorkspace()}>
            Add workspace
          </button>
        </div>
      </div>
    );
  }

  if (!activeChat) {
    return (
      <div className="empty-chat-state">
        <div className="empty-state-card">
          <div className="eyebrow">New chat</div>
          <div className="hero-title">What should Gemini help you with in {activeWorkspace.name}?</div>
          <p className="empty-state-copy">Create a chat to keep prompts, logs, and CLI activity together for this workspace.</p>
          <button className="cta-button" onClick={() => void createChat()}>
            Start a new chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-view">
      <div ref={messageListRef} className={`message-list ${isEmptyChat ? "message-list-empty" : ""}`.trim()}>
        {environment?.dependencies.some((dependency) => dependency.id === "ripgrep" && !dependency.installed) ? (
          <div className="warning-banner">Ripgrep is missing. Gemini CLI still works, but workspace search falls back to a slower tool.</div>
        ) : null}

        {activeChat.messages.length === 0 ? (
          <div className="empty-inline-state">
            <div className="eyebrow">Ready</div>
            <div className="hero-title">What should Gemini help you with in {activeWorkspace.name}?</div>
          </div>
        ) : null}

        {chatMessages.map((message, index) => {
          if (message.role === "user") {
            return <UserBubble key={message.id} message={message} />;
          }

          const isLatest = index === chatMessages.length - 1;
          const activities = groupedActivities.get(message.id) ?? [];

          return (
            <AssistantResponse
              key={message.id}
              message={message}
              activities={activities}
              changeSet={message.changeSetId ? changeSetMap.get(message.changeSetId) : undefined}
              isLatest={isLatest}
              isBusy={isLatest && isBusy}
              tick={tick}
              onRegenerate={sendPrompt}
              lastUserPrompt={lastUserPrompt}
              onOpenPath={(filePath) => void openPath(filePath)}
              onRequestRevert={(changeSetId, relativePath) => setRevertTarget({ changeSetId, relativePath })}
            />
          );
        })}
      </div>

      {!isScrolledToBottom ? (
        <button className="scroll-to-bottom-button" type="button" onClick={() => scrollToBottom()} title="Scroll to bottom" aria-label="Scroll to bottom">
          <ActionIcon name="arrow-down" />
        </button>
      ) : null}

      <div className="composer-wrap">
        <div className="composer">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe the task for Gemini CLI..."
            rows={2}
          />
          <div className="composer-footer">
            <div className="composer-left-controls">
              <button className="composer-plus-button" title="Attach file" aria-label="Attach file">
                <ActionIcon name="plus" />
              </button>
              <CustomDropdown
                className="composer-mode-dropdown"
                options={ACCESS_PRESET_OPTIONS}
                value={currentAccessPreset}
                onChange={(value) => void updateChat(activeChat.session.id, getAccessConfig(value as AccessPreset))}
                ariaLabel="Agent mode"
                placement="top"
              />
            </div>

            <div className="composer-right-controls">
              <div className="composer-indicators">
                <div
                  className="metric-pill metric-pill-quota"
                  title={`Usage\nRequests in this chat: ${requestCount}\nRecorded Gemini CLI token usage: ${totalUsedTokens.toLocaleString()} tokens`}
                >
                  <span className="metric-dot" style={{ ["--metric-fill" as string]: "100%" }} />
                  <span>{requestCount === 0 ? "Usage" : `Usage ${requestCount}`}</span>
                </div>
                <div
                  className="metric-pill metric-pill-context"
                  title={`Context window\nEstimated used context: ${estimatedTokens.toLocaleString()} / ${contextLimit.toLocaleString()} tokens\nApproximate usage: ${Math.round(contextRatio * 100)}%`}
                >
                  <span className="metric-dot subtle" style={{ ["--metric-fill" as string]: `${contextRatio * 100}%` }} />
                  <span>Context</span>
                </div>
              </div>

              <CustomDropdown
                className="composer-model-dropdown"
                options={models.map((model) => ({ value: model.id, label: model.label }))}
                value={currentModel}
                onChange={(value) => void updateChat(activeChat.session.id, { model: value })}
                ariaLabel="Preferred model"
                placement="top"
              />

              {isBusy ? (
                <button className="send-button stop composer-stop-button" onClick={() => void stopPrompt()}>
                  Stop
                </button>
              ) : (
                <button
                  className="send-button composer-send-button"
                  onClick={handleSend}
                  disabled={!prompt.trim() || isBlockedByOtherChat}
                  title={isBlockedByOtherChat ? "An agent is already running in another chat." : "Send"}
                >
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="composer-meta">
          <span>{activeWorkspace.path}</span>
          <span>
            Gemini CLI: {cliStatus}
            {activeChat.session.cliSessionId ? ` | session ${activeChat.session.cliSessionId}` : ""}
          </span>
          <button className="link-button" onClick={() => void openChat(activeChat.session.id)}>
            Refresh chat
          </button>
        </div>
      </div>

      {revertTarget ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setRevertTarget(null)}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="revert-change-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="revert-change-title">Revert agent changes?</h3>
            <p className="muted-text">
              This will restore the selected file set to the exact snapshot captured before the agent edited it. The action is blocked if the file was changed afterwards.
            </p>
            <div className="confirm-modal-actions">
              <button className="ghost-button" onClick={() => setRevertTarget(null)}>
                Cancel
              </button>
              <button
                className="nav-button danger-button"
                onClick={() => {
                  const target = revertTarget;
                  setRevertTarget(null);
                  void revertChangeSet(target.changeSetId, target.relativePath).catch((error) => {
                    setRevertError(error instanceof Error ? error.message : String(error));
                  });
                }}
              >
                Revert
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revertError ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setRevertError(null)}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="revert-error-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="revert-error-title">Rollback failed</h3>
            <p className="muted-text">{revertError}</p>
            <div className="confirm-modal-actions">
              <button className="nav-button" onClick={() => setRevertError(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
