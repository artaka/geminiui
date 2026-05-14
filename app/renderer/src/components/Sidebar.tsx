import { useState, useEffect } from "react";
import { ChatSession } from "@shared/types";
import { useAppStore } from "../store";
import { ActionIcon } from "./chat/Glyphs";
import { formatRelativeTime } from "./chat/ChatUtils";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function SidebarButton(props: {
  icon: React.ReactNode;
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

export function Sidebar({ collapsed }: SidebarProps) {
  const settings = useAppStore((state) => state.settings);
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const chats = useAppStore((state) => state.chats);
  const activeChat = useAppStore((state) => state.activeChat);
  const activeRunChatId = useAppStore((state) => state.activeRunChatId);
  const activeScreen = useAppStore((state) => state.activeScreen);
  const setScreen = useAppStore((state) => state.setScreen);
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const openChat = useAppStore((state) => state.openChat);
  const deleteChat = useAppStore((state) => state.deleteChat);
  const createChat = useAppStore((state) => state.createChat);
  const updateState = useAppStore((state) => state.updateState);

  const [now, setNow] = useState(Date.now());
  const [deleteCandidate, setDeleteCandidate] = useState<ChatSession | null>(null);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(new Set());
  const [workspaceChats, setWorkspaceChats] = useState<Record<string, ChatSession[]>>({});

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeWorkspace) return;
    setExpandedWorkspaces((current) => {
      const next = new Set(current);
      next.add(activeWorkspace.id);
      return next;
    });
    setWorkspaceChats((current) => ({ ...current, [activeWorkspace.id]: chats }));
  }, [activeWorkspace?.id, chats]);

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

  const handleOpenChat = (chatId: string) => {
    setScreen("chat");
    void openChat(chatId);
  };

  const showForcedUpdateBanner = Boolean(settings?.debugForceUpdateBanner);
  const hasUpdateBadge = updateState.status === "available" || updateState.status === "downloaded" || showForcedUpdateBanner;

  return (
    <>
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar-static">
          <div className="nav-section">
            <SidebarButton icon={<ActionIcon name="new" />} label="New chat" collapsed={collapsed} className="primary" disabled={!activeWorkspace} onClick={() => void createChat()} />
            <SidebarButton icon={<ActionIcon name="search" />} label="Search" collapsed={collapsed} className={activeScreen === "search" ? "selected" : ""} onClick={() => setScreen("search")} />
            <SidebarButton icon={<ActionIcon name="projects" />} label="Projects" collapsed={collapsed} className={activeScreen === "projects" ? "selected" : ""} onClick={() => setScreen("projects")} />
            <SidebarButton icon={<ActionIcon name="tools" />} label="Tools Soon" collapsed={collapsed} disabled title="Tool activity is currently shown inside chat logs" />
            <SidebarButton icon={<ActionIcon name="automations" />} label="Automations Soon" collapsed={collapsed} disabled title="Automations are planned for a future iteration" />
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
                            <ActionIcon name="toggle" />
                          </span>
                          <span className="workspace-folder-icon">
                            <ActionIcon name="workspace" />
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
                              <ActionIcon name="close" />
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
          <SidebarButton
            icon={<ActionIcon name="settings" />}
            label="Settings"
            collapsed={collapsed}
            className={`${activeScreen === "settings" ? "selected" : ""} ${hasUpdateBadge ? "has-update-badge" : ""}`.trim()}
            onClick={() => setScreen("settings")}
          />
        </div>
      </aside>

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
    </>
  );
}
