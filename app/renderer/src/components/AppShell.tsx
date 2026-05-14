import { useState } from "react";
import { useAppStore } from "../store";
import { ChatView } from "./ChatView";
import { SettingsView } from "./SettingsView";
import { SearchView } from "./SearchView";
import { ProjectsView } from "./ProjectsView";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ActionIcon } from "./chat/Glyphs";

export function AppShell() {
  const activeScreen = useAppStore((state) => state.activeScreen);
  const settings = useAppStore((state) => state.settings);
  const updateState = useAppStore((state) => state.updateState);
  const [collapsed, setCollapsed] = useState(false);

  const showForcedUpdateBanner = Boolean(settings?.debugForceUpdateBanner);
  const showUpdateBanner = activeScreen === "chat" && (updateState.status === "downloaded" || showForcedUpdateBanner);
  const canInstallDownloadedUpdate = updateState.status === "downloaded";

  return (
    <div className="shell">
      <Topbar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />

      <div className={`body ${collapsed ? "sidebar-collapsed" : ""}`}>
        <Sidebar collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />

        <main className={`content ${showUpdateBanner ? "has-update-banner" : ""}`.trim()}>
          {showUpdateBanner && (
            <div className="update-banner">
              <div className="update-banner-icon">
                <ActionIcon name="check" />
              </div>
              <div className="update-banner-text">
                <strong>Update ready</strong>
                <span>
                  Version {updateState.version ?? "debug"} has been downloaded and is ready to install.
                </span>
              </div>
              <button
                className="nav-button primary update-banner-button"
                onClick={() => void window.gemini.updater.quitAndInstall()}
                disabled={!canInstallDownloadedUpdate}
                title={canInstallDownloadedUpdate ? "Restart and install the downloaded update" : "Debug banner is forced from the settings JSON"}
              >
                Restart to update
              </button>
            </div>
          )}
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
    </div>
  );
}
