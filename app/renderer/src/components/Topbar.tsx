import { useEffect, useState } from "react";
import { useAppStore } from "../store";
import { ActionIcon } from "./chat/Glyphs";

interface TopbarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Topbar({ collapsed, onToggleCollapse }: TopbarProps) {
  const cliHealth = useAppStore((state) => state.cliHealth);
  const activeChat = useAppStore((state) => state.activeChat);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const cliStatus = useAppStore((state) => state.cliStatus);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.gemini.window.isMaximized().then((value) => {
      if (mounted) {
        setIsMaximized(value);
      }
    });

    const unsubscribe = window.gemini.window.onMaximizedChanged((value) => setIsMaximized(value));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const headerPath = activeWorkspace?.path ?? "No workspace selected";

  return (
    <header className="topbar">
      <div className="topbar-group topbar-left">
        <button
          className="nav-toggle"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className={`nav-icon toggle-icon ${collapsed ? "collapsed" : ""}`}>
            <ActionIcon name="toggle" />
          </span>
        </button>
      </div>
      <div className="topbar-center">
        <div className="project-path" title={headerPath}>
          {headerPath}
        </div>
        <div className="project-meta" title={activeChat?.session.title ?? "New chat"}>
          {activeChat?.session.title ?? "New chat"}
        </div>
      </div>
      <div className="topbar-group topbar-right">
        <span className={`status-dot status-${cliStatus}`} />
        <span className="status-label">{cliStatus}</span>
        <div className="account-badge">
          <div className="avatar-fallback">G</div>
          <div>
            <div>Gemini CLI</div>
            <div className="muted-text">{cliHealth?.version ?? cliHealth?.path ?? "Not detected"}</div>
          </div>
        </div>
        <div className="window-controls" aria-label="Window controls">
          <button className="window-control-button" onClick={() => void window.gemini.window.minimize()} aria-label="Minimize window" title="Minimize">
            <ActionIcon name="minimize" />
          </button>
          <button
            className="window-control-button"
            onClick={() => void window.gemini.window.toggleMaximize()}
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
            title={isMaximized ? "Restore" : "Maximize"}
          >
            <ActionIcon name="maximize" />
          </button>
          <button className="window-control-button danger" onClick={() => void window.gemini.window.close()} aria-label="Close window" title="Close">
            <ActionIcon name="close" />
          </button>
        </div>
      </div>
    </header>
  );
}
