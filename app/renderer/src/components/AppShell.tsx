import { ReactNode, useEffect, useState } from "react";
import { ChatSession } from "@shared/types";
import { useAppStore } from "../store";
import { ChatView } from "./ChatView";
import { SettingsView } from "./SettingsView";

function SidebarIcon(props: { name: "toggle" | "new" | "search" | "projects" | "tools" | "automations" | "workspace" | "settings" | "login" | "check" | "minimize" | "maximize" | "close" }) {
  switch (props.name) {
    case "toggle":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M7 5l6 5-6 5" />
        </svg>
      );
    case "new":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="4.5" />
          <path d="M12 12l4 4" />
        </svg>
      );
    case "projects":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3.5" y="4" width="13" height="12" rx="2" />
          <path d="M3.5 8.5h13" />
        </svg>
      );
    case "tools":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M12.2 3.8a3.2 3.2 0 002.9 4.4l-7.6 7.6a1.4 1.4 0 11-2-2l7.6-7.6a3.2 3.2 0 01-.9-2.3 3.2 3.2 0 01.3-1.4l1.8 1.8 1.8-1.8-1.8-1.8c.4-.2.9-.3 1.4-.3a3.2 3.2 0 012.5 5.2" />
        </svg>
      );
    case "automations":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="4" y="4" width="12" height="12" rx="6" />
          <path d="M10 7v3l2 2" />
        </svg>
      );
    case "workspace":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3.5 6.5h5l1.5 2h6.5v6.5a1 1 0 01-1 1h-11a1 1 0 01-1-1v-8.5a1 1 0 011-1z" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="2.75" />
          <path d="M10 3.5v2M10 14.5v2M3.5 10h2M14.5 10h2M5.4 5.4l1.4 1.4M13.2 13.2l1.4 1.4M14.6 5.4l-1.4 1.4M6.8 13.2l-1.4 1.4" />
        </svg>
      );
    case "login":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M8 5H5.5A1.5 1.5 0 004 6.5v7A1.5 1.5 0 005.5 15H8" />
          <path d="M10 6l4 4-4 4M14 10H7" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M4.5 10.5l3.2 3.2 7.8-7.8" />
        </svg>
      );
    case "minimize":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 10h10" />
        </svg>
      );
    case "maximize":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="5" y="5" width="10" height="10" rx="1.5" />
        </svg>
      );
    case "close":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M6 6l8 8M14 6l-8 8" />
        </svg>
      );
    default:
      return null;
  }
}

function SidebarButton(props: {
  icon: ReactNode;
  label: string;
  collapsed: boolean;
  className?: string;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <button className={`nav-button nav-button-with-icon ${props.className ?? ""}`.trim()} disabled={props.disabled} title={props.title ?? props.label} onClick={props.onClick}>
      <span className="nav-icon">{props.icon}</span>
      <span className={`nav-label ${props.collapsed ? "collapsed-hidden" : ""}`}>{props.label}</span>
    </button>
  );
}

function formatRelativeTime(value: string, now: number): string {
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

export function AppShell() {
  const cliHealth = useAppStore((state) => state.cliHealth);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const chats = useAppStore((state) => state.chats);
  const activeChat = useAppStore((state) => state.activeChat);
  const cliStatus = useAppStore((state) => state.cliStatus);
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const selectWorkspace = useAppStore((state) => state.selectWorkspace);
  const openChat = useAppStore((state) => state.openChat);
  const deleteChat = useAppStore((state) => state.deleteChat);
  const createChat = useAppStore((state) => state.createChat);
  const activeScreen = useAppStore((state) => state.activeScreen);
  const setScreen = useAppStore((state) => state.setScreen);
  const [isMaximized, setIsMaximized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [deleteCandidate, setDeleteCandidate] = useState<ChatSession | null>(null);

  const headerPath = activeWorkspace?.path ?? "No workspace selected";
  const handleOpenChat = (chatId: string) => {
    setScreen("chat");
    void openChat(chatId);
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

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

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-group topbar-left">
          <button
            className="nav-toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className={`nav-icon toggle-icon ${collapsed ? "collapsed" : ""}`}>
              <SidebarIcon name="toggle" />
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
              <SidebarIcon name="minimize" />
            </button>
            <button
              className="window-control-button"
              onClick={() => void window.gemini.window.toggleMaximize()}
              aria-label={isMaximized ? "Restore window" : "Maximize window"}
              title={isMaximized ? "Restore" : "Maximize"}
            >
              <SidebarIcon name="maximize" />
            </button>
            <button className="window-control-button danger" onClick={() => void window.gemini.window.close()} aria-label="Close window" title="Close">
              <SidebarIcon name="close" />
            </button>
          </div>
        </div>
      </header>

      <div className={`body ${collapsed ? "sidebar-collapsed" : ""}`}>
        <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
          <div className="sidebar-static">
            <div className="nav-section">
              <SidebarButton icon={<SidebarIcon name="new" />} label="New chat" collapsed={collapsed} className="primary" disabled={!activeWorkspace} onClick={() => void createChat()} />
              <SidebarButton icon={<SidebarIcon name="search" />} label="Search Soon" collapsed={collapsed} disabled title="Planned for a future iteration" />
              <SidebarButton icon={<SidebarIcon name="projects" />} label="Projects Soon" collapsed={collapsed} disabled title="Workspace manager is still part of the current sidebar" />
              <SidebarButton icon={<SidebarIcon name="tools" />} label="Tools Soon" collapsed={collapsed} disabled title="Tool activity is currently shown inside chat logs" />
              <SidebarButton icon={<SidebarIcon name="automations" />} label="Automations Soon" collapsed={collapsed} disabled title="Automations are planned for a future iteration" />
            </div>
          </div>

          <div className="sidebar-scroll">
            {!collapsed ? (
              <>
                <div className="sidebar-section-header">
                  <span className="sidebar-section-title">Projects</span>
                  <button className="ghost-button sidebar-add-button" onClick={() => void addWorkspace()} title="Add workspace" aria-label="Add workspace">
                    +
                  </button>
                </div>

                <div className="workspace-tree">
                  {workspaces.map((workspace) => {
                    const isActiveWorkspace = activeWorkspace?.id === workspace.id;
                    return (
                      <div key={workspace.id} className={`workspace-group ${isActiveWorkspace ? "active" : ""}`}>
                        <button className={`workspace-card ${isActiveWorkspace ? "active" : ""}`} onClick={() => void selectWorkspace(workspace.id)} title={workspace.path}>
                          <div className="workspace-title-row">
                            <span className="workspace-folder-icon">
                              <SidebarIcon name="workspace" />
                            </span>
                            <span className="workspace-name">{workspace.name}</span>
                            {workspace.isMissing ? <span className="warning-badge">Missing</span> : null}
                          </div>
                        </button>

                        {isActiveWorkspace ? (
                          <div className="chat-tree">
                            {chats.map((chat) => (
                              <div key={chat.id} className={`chat-row ${activeChat?.session.id === chat.id ? "active" : ""}`}>
                                <button className={`chat-list-item chat-tree-item ${activeChat?.session.id === chat.id ? "active" : ""}`} onClick={() => handleOpenChat(chat.id)} title={chat.title}>
                                  <span className="chat-list-title">{chat.title}</span>
                                  <span className="chat-list-time muted-text">{formatRelativeTime(chat.updatedAt, now)}</span>
                                </button>
                                <button
                                  className="chat-delete-button"
                                  type="button"
                                  title="Delete chat"
                                  aria-label={`Delete chat ${chat.title}`}
                                  onClick={() => setDeleteCandidate(chat)}
                                >
                                  <SidebarIcon name="close" />
                                </button>
                              </div>
                            ))}
                            {chats.length === 0 ? <div className="empty-sidebar-text">No chats yet in this workspace.</div> : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {workspaces.length === 0 ? <div className="empty-sidebar-text">Add a folder to start working with Gemini CLI.</div> : null}
                </div>
              </>
            ) : null}
          </div>

          <div className="sidebar-footer">
            <SidebarButton icon={<SidebarIcon name="settings" />} label="Settings" collapsed={collapsed} className={activeScreen === "settings" ? "selected" : ""} onClick={() => setScreen("settings")} />
          </div>
        </aside>

        <main className="content">
          {activeScreen === "settings" ? <SettingsView /> : <ChatView />}
        </main>
      </div>

      {deleteCandidate ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDeleteCandidate(null)}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="delete-chat-title">Delete chat?</h3>
            <p className="muted-text">
              This will remove <strong>{deleteCandidate.title}</strong> with all its messages and activity logs.
            </p>
            <div className="confirm-modal-actions">
              <button className="ghost-button" onClick={() => setDeleteCandidate(null)}>
                Cancel
              </button>
              <button
                className="nav-button danger-button"
                onClick={() => {
                  const chatId = deleteCandidate.id;
                  setDeleteCandidate(null);
                  void deleteChat(chatId);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
