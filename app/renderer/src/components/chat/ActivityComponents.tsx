import { CliActivity } from "@shared/types";
import { formatClock } from "./ChatUtils";
import { RichTextMessage } from "./RichTextMessage";

export function ActivityIcon(props: { activity: CliActivity }) {
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

export function ActivityItem(props: { activity: CliActivity }) {
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
