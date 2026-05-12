import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js";
import { ChatSession, CliActivity, Message } from "@shared/types";
import { useAppStore } from "../store";
import { CustomDropdown, DropdownOption } from "./CustomDropdown";

function formatClock(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(startAt?: string, endAt?: number): string {
  if (!startAt) {
    return "0s";
  }

  const started = new Date(startAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(((endAt ?? Date.now()) - started) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function InlineRichText(props: { text: string }) {
  const nodes: ReactNode[] = [];
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(props.text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(props.text.slice(lastIndex, match.index));
    }

    if (match[2] && match[3]) {
      const href = match[3];
      nodes.push(
        <a key={`${href}-${match.index}`} className="inline-link" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(
        <code key={`code-${match.index}`} className="inline-code">
          {match[4]}
        </code>
      );
    } else if (match[5]) {
      nodes.push(
        <strong key={`strong-${match.index}`}>
          {match[5]}
        </strong>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < props.text.length) {
    nodes.push(props.text.slice(lastIndex));
  }

  return <>{nodes}</>;
}

function RichTextMessage(props: { text: string }) {
  const normalized = props.text.replace(/\r\n/g, "\n");
  const segments = normalized.split(/```/g);
  const blocks: ReactNode[] = [];

  const pushTextBlock = (textBlock: string, keyPrefix: string) => {
    const lines = textBlock.split("\n");
    const localBlocks: ReactNode[] = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index].trimEnd();

      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (line.startsWith("#")) {
        const level = Math.min(3, line.match(/^#+/)?.[0].length ?? 1);
        const content = line.replace(/^#+\s*/, "");
        const Tag = `h${level}` as "h1" | "h2" | "h3";
        localBlocks.push(
          <Tag key={`${keyPrefix}-heading-${index}`} className="rich-heading">
            <InlineRichText text={content} />
          </Tag>
        );
        index += 1;
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        const items: string[] = [];
        while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
          items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
          index += 1;
        }
        localBlocks.push(
          <ul key={`${keyPrefix}-list-${index}`} className="rich-list">
            {items.map((item, itemIndex) => (
              <li key={`${keyPrefix}-li-${itemIndex}`}>
                <InlineRichText text={item} />
              </li>
            ))}
          </ul>
        );
        continue;
      }

      if (/^\d+\.\s+/.test(line)) {
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

      if (line.startsWith(">")) {
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
      const highlightedCode = normalizedLanguage && hljs.getLanguage(normalizedLanguage)
        ? hljs.highlight(body.trim(), { language: normalizedLanguage, ignoreIllegals: true }).value
        : hljs.highlightAuto(body.trim()).value;
      blocks.push(
        <div key={`code-${segmentIndex}`} className="rich-code-block">
          {codeLanguage ? <div className="rich-code-label">{codeLanguage}</div> : null}
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
}

function ActivityIcon(props: { kind: CliActivity["kind"]; status: CliActivity["status"] }) {
  if (props.status === "error" || props.kind === "stderr" || props.kind === "error") {
    return <span className="activity-dot error" />;
  }

  if (props.status === "running") {
    return <span className="activity-dot running" />;
  }

  if (props.kind === "command") {
    return <span className="activity-dot command" />;
  }

  return <span className="activity-dot done" />;
}

function ActivityItem(props: { activity: CliActivity }) {
  const isLong = props.activity.body.includes("\n") || props.activity.body.length > 160;

  return (
    <div className={`agent-step ${props.activity.status}`}>
      <div className="agent-step-rail">
        <ActivityIcon kind={props.activity.kind} status={props.activity.status} />
      </div>
      <div className="agent-step-content">
        <div className="agent-step-header">
          <div className="agent-step-title">{props.activity.title}</div>
          <div className="agent-step-time">{formatClock(props.activity.createdAt)}</div>
        </div>
        {props.activity.kind === "command" ? (
          <code className="agent-step-command">{props.activity.body}</code>
        ) : isLong ? (
          <details className="agent-step-details">
            <summary>{props.activity.status === "error" ? "Show details" : "Expand details"}</summary>
            <pre className="activity-body">{props.activity.body}</pre>
          </details>
        ) : (
          <div className="agent-step-body">{props.activity.body}</div>
        )}
      </div>
    </div>
  );
}

function ActionIcon(props: { name: "copy" | "retry" | "chevron" | "plus" }) {
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
    default:
      return null;
  }
}

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
      return { approvalMode: "default", sandbox: true };
  }
}

const ACCESS_PRESET_OPTIONS: DropdownOption[] = [
  { value: "default-permissions", label: "Разрешения по умолчанию" },
  { value: "auto-review", label: "Автопроверка" },
  { value: "full-access", label: "Полный доступ" }
];

const ACCESS_PRESET_OPTIONS_RU: DropdownOption[] = [
  { value: "default-permissions", label: "Разрешения по умолчанию" },
  { value: "auto-review", label: "Автопроверка" },
  { value: "full-access", label: "Полный доступ" }
];

export function ChatView() {
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const activeChat = useAppStore((state) => state.activeChat);
  const cliStatus = useAppStore((state) => state.cliStatus);
  const settings = useAppStore((state) => state.settings);
  const environment = useAppStore((state) => state.environment);
  const models = useAppStore((state) => state.models);
  const updateChat = useAppStore((state) => state.updateChat);
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const createChat = useAppStore((state) => state.createChat);
  const sendPrompt = useAppStore((state) => state.sendPrompt);
  const stopPrompt = useAppStore((state) => state.stopPrompt);
  const openChat = useAppStore((state) => state.openChat);
  const [prompt, setPrompt] = useState("");
  const [tick, setTick] = useState(Date.now());
  const [workExpanded, setWorkExpanded] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const isBusy = cliStatus === "starting" || cliStatus === "streaming" || cliStatus === "busy";

  useEffect(() => {
    if (!isBusy) {
      return;
    }

    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isBusy]);

  useEffect(() => {
    if (isBusy) {
      setWorkExpanded(true);
    }
  }, [isBusy]);

  const handleSend = () => {
    const value = prompt.trim();
    if (!value || isBusy) {
      return;
    }
    void sendPrompt(value);
    setPrompt("");
  };

  const chatMessages = activeChat?.messages ?? [];
  const chatActivities = activeChat?.activities ?? [];
  const lastUserPrompt = [...chatMessages].reverse().find((message) => message.role === "user")?.content;
  const latestUserIndex = [...chatMessages].map((message, index) => ({ message, index })).reverse().find((entry) => entry.message.role === "user")?.index ?? -1;
  const latestUserMessage = latestUserIndex >= 0 ? chatMessages[latestUserIndex] : null;
  const latestAssistantIndex = [...chatMessages].map((message, index) => ({ message, index })).reverse().find((entry) => entry.message.role === "assistant")?.index ?? -1;
  const latestAssistant = latestAssistantIndex >= 0 ? chatMessages[latestAssistantIndex] : null;
  const historicalMessages = latestAssistantIndex >= 0 ? chatMessages.filter((_, index) => index !== latestAssistantIndex) : chatMessages;

  const latestRunActivities = useMemo(() => {
    if (!latestAssistant) {
      return chatActivities;
    }

    const startedAt = new Date((latestUserMessage ?? latestAssistant).createdAt).getTime();
    return chatActivities.filter((activity) => new Date(activity.createdAt).getTime() >= startedAt);
  }, [chatActivities, latestAssistant, latestUserMessage]);

  const visibleActivities = latestRunActivities.filter((activity) => !(activity.kind === "status" && activity.title === "Structured response"));
  const runStartedAt = visibleActivities[0]?.createdAt ?? latestUserMessage?.createdAt ?? latestAssistant?.createdAt;
  const runCompleted = latestAssistant?.status === "done" || latestAssistant?.status === "error";
  const runEndedAt = runCompleted
    ? visibleActivities[visibleActivities.length - 1]?.createdAt ?? latestAssistant?.createdAt ?? runStartedAt
    : undefined;
  const showRunPanel = visibleActivities.length > 0 || latestAssistant?.status === "streaming";
  const isEmptyChat = chatMessages.length === 0;
  const totalChars = chatMessages.reduce((sum, message) => sum + message.content.length, 0);
  const estimatedTokens = Math.max(1, Math.round(totalChars / 4));
  const contextLimit = 128000;
  const contextRatio = Math.min(1, estimatedTokens / contextLimit);
  const requestCount = activeChat?.session.usage.requestCount ?? 0;
  const totalUsedTokens = activeChat?.session.usage.totalTokens ?? 0;
  const currentModel = activeChat?.session.model ?? settings?.preferredModel ?? "auto";
  const currentAccessPreset = activeChat ? getAccessPreset(activeChat.session) : "default-permissions";

  useEffect(() => {
    if (!isBusy && showRunPanel) {
      setWorkExpanded(false);
    }
  }, [isBusy, showRunPanel, latestAssistant?.id, latestAssistant?.status]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [activeChat?.session.id, chatMessages.length, chatActivities.length, latestAssistant?.content, workExpanded]);

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

        {historicalMessages.map((message) =>
          message.role === "user" ? (
            <UserBubble key={message.id} message={message} />
          ) : (
            <div key={message.id} className={`assistant-response-block ${message.status}`}>
              <RichTextMessage text={message.content} />
              <div className="assistant-response-toolbar">
                <div className="assistant-response-meta">{formatClock(message.createdAt)}</div>
                <button className="icon-link-button" onClick={() => void navigator.clipboard.writeText(message.content)} title="Copy answer" aria-label="Copy answer">
                  <ActionIcon name="copy" />
                </button>
              </div>
            </div>
          )
        )}

        {showRunPanel ? (
          <section className="agent-run-wrap">
            <button className="agent-run-toggle" onClick={() => setWorkExpanded((value) => !value)} aria-expanded={workExpanded}>
              <span>{runCompleted ? `Worked for ${formatElapsed(runStartedAt, runEndedAt ? new Date(runEndedAt).getTime() : tick)}` : `Working for ${formatElapsed(runStartedAt, tick)}`}</span>
              <span className={`chevron-icon ${workExpanded ? "expanded" : ""}`}>
                <ActionIcon name="chevron" />
              </span>
            </button>
            {workExpanded ? (
              <div className="agent-run-panel">
                <div className="agent-run-timeline">
                  {visibleActivities.map((activity) => (
                    <ActivityItem key={activity.id} activity={activity} />
                  ))}
                  {latestAssistant?.status === "streaming" ? (
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

        {latestAssistant ? (
          <section className={`assistant-response-block latest ${latestAssistant.status}`}>
            {latestAssistant.content ? (
              <RichTextMessage text={latestAssistant.content} />
            ) : (
              <div className="assistant-placeholder">
                <span className="assistant-placeholder-dot" />
                <span>{latestAssistant.status === "error" ? "The run ended with an error." : "Waiting for the assistant response..."}</span>
              </div>
            )}
            <div className="assistant-response-toolbar">
              <span className="assistant-response-meta">{formatClock(latestAssistant.createdAt)}</span>
              <div className="assistant-response-actions">
                <button
                  className="icon-link-button"
                  onClick={() => void navigator.clipboard.writeText(latestAssistant.content)}
                  disabled={!latestAssistant.content}
                  title="Copy answer"
                  aria-label="Copy answer"
                >
                  <ActionIcon name="copy" />
                </button>
                {lastUserPrompt ? (
                  <button
                    className="icon-link-button"
                    onClick={() => {
                      void sendPrompt(lastUserPrompt);
                    }}
                    disabled={isBusy}
                    title="Regenerate answer"
                    aria-label="Regenerate answer"
                  >
                    <ActionIcon name="retry" />
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
      </div>

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
                options={ACCESS_PRESET_OPTIONS_RU}
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
                <button className="send-button composer-send-button" onClick={handleSend} disabled={!prompt.trim()}>
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
    </div>
  );
}
