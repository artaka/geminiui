import { useAppStore } from "../store";
import { SidebarIcon } from "./AppShell";

export function ProjectsView() {
  const workspaces = useAppStore((state) => state.workspaces);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const selectWorkspace = useAppStore((state) => state.selectWorkspace);
  const setScreen = useAppStore((state) => state.setScreen);

  const handleOpenWorkspace = (id: string) => {
    void selectWorkspace(id);
    setScreen("chat");
  };

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <div className="settings-title-block">
          <div className="eyebrow">Projects</div>
          <h2>Workspace manager</h2>
          <p className="settings-intro">Manage your local project folders and their attached chat histories.</p>
        </div>
        <button className="cta-button" style={{ width: "auto" }} onClick={() => void addWorkspace()}>
          Add workspace
        </button>
      </div>

      <div className="settings-grid">
        {workspaces.map((workspace) => (
          <div key={workspace.id} className="settings-column">
            <section className={`settings-card ${activeWorkspace?.id === workspace.id ? "selected-project" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                 <div className="workspace-folder-icon">
                   <SidebarIcon name="workspace" />
                 </div>
                 <h3 style={{ margin: 0 }}>{workspace.name}</h3>
                 {workspace.isMissing ? <span className="warning-badge">Missing</span> : null}
              </div>
              <p className="muted-text" style={{ wordBreak: "break-all" }}>{workspace.path}</p>
              <div className="settings-actions" style={{ marginTop: "8px" }}>
                <button 
                  className="nav-button primary" 
                  onClick={() => handleOpenWorkspace(workspace.id)}
                  disabled={workspace.isMissing}
                >
                  Open project
                </button>
                <button 
                  className="nav-button" 
                  onClick={() => void window.gemini.chat.openPath(workspace.path)}
                  disabled={workspace.isMissing}
                >
                  Show in Explorer
                </button>
              </div>
            </section>
          </div>
        ))}
        {workspaces.length === 0 ? (
          <div className="settings-card-wide">
             <p className="muted-text">No workspaces added yet. Add a folder to start working.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
