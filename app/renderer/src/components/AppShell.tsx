import { ReactNode, useEffect, useState } from "react";
import { ChatSession } from "@shared/types";
import { useAppStore } from "../store";
import { ChatView } from "./ChatView";
import { SettingsView } from "./SettingsView";
import { SearchView } from "./SearchView";
import { ProjectsView } from "./ProjectsView";

export function SidebarIcon(props: { name: "toggle" | "new" | "search" | "projects" | "tools" | "automations" | "workspace" | "settings" | "login" | "check" | "minimize" | "maximize" | "close" }) {
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
          <path d="M 16.2 8.205 C 14.947 10.071 12.816 9.789 12.798 9.81 L 5.198 17.41 C 4.428 18.18 3.114 17.828 2.832 16.776 C 2.701 16.288 2.841 15.768 3.198 15.41 L 10.798 7.81 C 10.202 7.195 9.766 5.943 9.786 5.086 C 9.779 4.603 9.993 4.548 10.198 4.11 L 11.998 5.91 L 13.798 4.11 L 11.998 2.31 C 12.398 2.11 12.898 2.01 13.398 2.01 C 15.861 2.009 18.027 5.279 16.796 7.413 C 16.796 7.413 16.805 7.417 16.805 7.417 C 16.724 7.557 16.91 7.283 16.809 7.409" />
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
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.884 8.375c0-.904 0-1.356.176-1.701.155-.305.403-.552.706-.706.346-.176.798-.176 1.702-.176h2.805c.395 0 .592 0 .778.044.165.04.323.105.467.193.163.1.303.24.581.519l.102.101c.279.28.419.419.582.519.145.089.302.154.467.193.185.046.382.046.778.046h2.805c.904 0 1.356 0 1.701.176.304.154.551.401.706.705.176.346.176.798.176 1.702v4.521c0 .904 0 1.356-.176 1.702a1.62 1.62 0 0 1-.706.705c-.345.176-.797.176-1.701.176H7.468c-.904 0-1.356 0-1.702-.176a1.625 1.625 0 0 1-.706-.705c-.176-.346-.176-.798-.176-1.702V8.375Z"
                transform="matrix(1.14617 0 0 1.14617 -3.953 -3.025)"
            />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
            <g transform="matrix(.15465 0 0 .12412 -30.225 -23.564)">
                <path
                    d="M261.538 250.025c-12.049-1.441-20.868 13.45-15.874 26.803 4.994 13.354 20.055 15.155 27.111 3.242 2.224-3.758 3.245-8.366 2.87-12.967-.749-9.029-6.648-16.171-14.107-17.078Zm37.872 18.95a55.229 55.229 0 0 1-.377 6.184l11.111 10.551c.999 1.002 1.254 2.732.603 4.091l-10.512 22.017c-.659 1.345-2.022 1.921-3.229 1.365l-11.035-5.379c-1.236-.596-2.636-.4-3.728.521a39.475 39.475 0 0 1-5.293 3.731c-1.175.692-1.989 2.046-2.168 3.611l-1.654 14.25c-.224 1.551-1.324 2.694-2.625 2.728h-21.022c-1.278-.027-2.37-1.124-2.627-2.64l-1.652-14.227c-.188-1.584-1.018-2.948-2.211-3.636a37.381 37.381 0 0 1-5.274-3.739c-1.088-.917-2.484-1.108-3.714-.51l-11.032 5.377c-1.207.556-2.569-.019-3.229-1.363l-10.511-22.016c-.653-1.359-.398-3.09.602-4.092l9.39-8.925c1.045-1.005 1.601-2.581 1.475-4.189a51.96 51.96 0 0 1-.143-3.72c0-1.24.052-2.46.143-3.674.111-1.598-.449-3.158-1.492-4.148l-9.385-8.925c-.983-1.007-1.229-2.722-.583-4.071l10.511-22.016c.659-1.346 3.033-2.836 4.241-2.28l10.023 6.293c1.236.596 2.636.401 3.728-.52a39.475 39.475 0 0 1 5.293-3.731c1.176-.691 1.989-2.045 2.168-3.612l1.654-14.248c.224-1.553 1.324-2.695 2.625-2.729h21.022c1.278.027 2.37 1.123 2.627 2.639l1.652 14.228c.188 1.584 1.019 2.948 2.212 3.635a37.282 37.282 0 0 1 5.273 3.741c1.089.916 2.485 1.108 3.714.508l11.032-5.376c1.207-.556 2.569.019 3.229 1.363l10.511 22.017c.653 1.357.399 3.089-.602 4.091l-9.39 8.925c-1.05 1.001-1.61 2.578-1.487 4.189.081 1.232.136 2.469.136 3.711Z"
                    style={{
                        fill: "none",
                        strokeLinecap: "round",
                        strokeLinejoin: "round",
                        strokeWidth: 10,
                    }}
                />
            </g>
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
  const activeRunChatId = useAppStore((state) => state.activeRunChatId);
  const cliStatus = useAppStore((state) => state.cliStatus);
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const openChat = useAppStore((state) => state.openChat);
  const deleteChat = useAppStore((state) => state.deleteChat);
  const createChat = useAppStore((state) => state.createChat);
  const activeScreen = useAppStore((state) => state.activeScreen);
  const setScreen = useAppStore((state) => state.setScreen);
  const [isMaximized, setIsMaximized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [deleteCandidate, setDeleteCandidate] = useState<ChatSession | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [workspaceChats, setWorkspaceChats] = useState<Record<string, ChatSession[]>>({});

  const headerPath = activeWorkspace?.path ?? "No workspace selected";
  const handleOpenChat = (chatId: string) => {
    setScreen("chat");
    void openChat(chatId);
  };

  const toggleWorkspace = (workspaceId: string) => {
    setExpandedWorkspaces((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) {
        next.delete(workspaceId);
      } else {
        next.add(workspaceId);
        void window.gemini.chat.list(workspaceId).then((loadedChats) => {
          setWorkspaceChats((items) => ({ ...items, [workspaceId]: loadedChats }));
        });
      }
      return next;
    });
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeWorkspace) {
      return;
    }
    setExpandedWorkspaces((current) => {
      const next = new Set(current);
      next.add(activeWorkspace.id);
      return next;
    });
    setWorkspaceChats((current) => ({ ...current, [activeWorkspace.id]: chats }));
  }, [activeWorkspace?.id, chats]);

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
              <SidebarButton icon={<SidebarIcon name="search" />} label="Search" collapsed={collapsed} className={activeScreen === "search" ? "selected" : ""} onClick={() => setScreen("search")} />
              <SidebarButton icon={<SidebarIcon name="projects" />} label="Projects" collapsed={collapsed} className={activeScreen === "projects" ? "selected" : ""} onClick={() => setScreen("projects")} />
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
                    const isExpanded = expandedWorkspaces.has(workspace.id);
                    const visibleChats = isActiveWorkspace ? chats : workspaceChats[workspace.id] ?? [];
                    return (
                      <div key={workspace.id} className={`workspace-group ${isActiveWorkspace ? "active" : ""} ${isExpanded ? "expanded" : ""}`}>
                        <button className={`workspace-card ${isActiveWorkspace ? "active" : ""}`} onClick={() => toggleWorkspace(workspace.id)} title={workspace.path} aria-expanded={isExpanded}>
                          <div className="workspace-title-row">
                            <span className={`workspace-expand-icon ${isExpanded ? "expanded" : ""}`}>
                              <SidebarIcon name="toggle" />
                            </span>
                            <span className="workspace-folder-icon">
                              <SidebarIcon name="workspace" />
                            </span>
                            <span className="workspace-name">{workspace.name}</span>
                            {workspace.isMissing ? <span className="warning-badge">Missing</span> : null}
                          </div>
                        </button>

                        <div className={`chat-tree ${isExpanded ? "expanded" : "collapsed"}`} aria-hidden={!isExpanded}>
                          {visibleChats.map((chat) => (
                            <div key={chat.id} className={`chat-row ${activeChat?.session.id === chat.id ? "active" : ""}`}>
                              <button className={`chat-list-item chat-tree-item ${activeChat?.session.id === chat.id ? "active" : ""}`} onClick={() => handleOpenChat(chat.id)} title={chat.title}>
                                <span className="chat-list-title">{chat.title}</span>
                                {activeRunChatId === chat.id ? <span className="chat-running-spinner" aria-label="Agent running" /> : <span className="chat-list-time muted-text">{formatRelativeTime(chat.updatedAt, now)}</span>}
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
                          {visibleChats.length === 0 ? <div className="empty-sidebar-text">No chats yet in this workspace.</div> : null}
                        </div>
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
          {activeScreen === "settings" ? (
            <SettingsView />
          ) : activeScreen === "search" ? (
            <SearchView />
          ) : activeScreen === "projects" ? (
            <ProjectsView />
          ) : (
            <ChatView />
          )}
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
