import { memo, useEffect, useState } from "react";
import { CliActivity, FileChangeSet, Message } from "@shared/types";
import { formatClock, formatElapsed } from "./ChatUtils";
import { ActionIcon } from "./Glyphs";
import { AttachmentPreviewList } from "./AttachmentPreviewList";
import { RichTextMessage } from "./RichTextMessage";
import { ChangeSetPanel } from "./ChangeSetPanel";
import { ActivityItem } from "./ActivityComponents";

export function UserBubble(props: { message: Message }) {
  return (
    <div className="user-bubble-row">
      <div className="user-bubble">
        {props.message.attachments?.length ? <AttachmentPreviewList attachments={props.message.attachments} compact /> : null}
        {props.message.content ? <div className="user-bubble-body">{props.message.content}</div> : null}
      </div>
      <div className="user-bubble-actions external">
        <button className="icon-link-button" onClick={() => void navigator.clipboard.writeText(props.message.content)} title="Copy message" aria-label="Copy message" disabled={!props.message.content}>
          <ActionIcon name="copy" />
        </button>
        <span className="muted-text">{formatClock(props.message.createdAt)}</span>
      </div>
    </div>
  );
}

export const AssistantResponse = memo(function AssistantResponse(props: {
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

      <div className={`assistant-response-block ${props.isLatest ? "latest" : ""} ${props.message.status} ${props.changeSet ? "has-change-set" : ""}`.trim()}>
        {props.message.content ? (
          <RichTextMessage text={props.message.content} />
        ) : props.isLatest && props.message.status === "streaming" ? (
          <div className="assistant-placeholder">
            <span className="assistant-placeholder-dot" />
            <span>Waiting for the assistant response...</span>
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
