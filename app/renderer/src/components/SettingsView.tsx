import { useEffect } from "react";
import { useAppStore } from "../store";
import { CustomDropdown } from "./CustomDropdown";

const SANDBOX_MODE_OPTIONS = [
  { value: "auto", label: "Auto (enabled, fallback allowed)" },
  { value: "force", label: "Force (sandbox required)" },
  { value: "off", label: "Off" }
];

export function SettingsView() {
  const settings = useAppStore((state) => state.settings);
  const diagnostics = useAppStore((state) => state.diagnostics);
  const cliHealth = useAppStore((state) => state.cliHealth);
  const environment = useAppStore((state) => state.environment);
  const models = useAppStore((state) => state.models);
  const workspaces = useAppStore((state) => state.workspaces);
  const chats = useAppStore((state) => state.chats);
  const activeWorkspace = useAppStore((state) => state.activeWorkspace);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const updateState = useAppStore((state) => state.updateState);
  const checkForUpdates = useAppStore((state) => state.checkForUpdates);
  const quitAndInstall = useAppStore((state) => state.quitAndInstall);
  const loadDiagnostics = useAppStore((state) => state.loadDiagnostics);
  const exportLogs = useAppStore((state) => state.exportLogs);
  const recheckCli = useAppStore((state) => state.recheckCli);
  const openCliLogin = useAppStore((state) => state.openCliLogin);
  const installCli = useAppStore((state) => state.installCli);
  const setupSandbox = useAppStore((state) => state.setupSandbox);
  const addWorkspace = useAppStore((state) => state.addWorkspace);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const totalRequests = chats.reduce((sum, chat) => sum + (chat.usage?.requestCount ?? 0), 0);
  const totalTokens = chats.reduce((sum, chat) => sum + (chat.usage?.totalTokens ?? 0), 0);

  const formatCompactNumber = (value: number) =>
    new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: value >= 1000 ? 1 : 0
    }).format(value);

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <div className="settings-title-block">
          <div className="eyebrow">Settings</div>
          <h2>GeminiUI configuration</h2>
          <p className="settings-intro">Tweak Gemini CLI integration and model defaults without leaving the workspace.</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-stack-top">
          <section className="settings-card settings-card-fill">
            <h3>Authentication</h3>
            <p className="muted-text">Gemini authentication is delegated to the installed Gemini CLI. The app only verifies that CLI login has already been completed.</p>
            {environment ? (
              <div className="env-list">
                {environment.dependencies.map((dependency) => (
                  <div key={dependency.id} className={`env-item ${dependency.installed ? "ok" : "warn"}`}>
                    <strong>{dependency.name}</strong>: {dependency.installed ? "installed" : dependency.installHint}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="settings-card settings-card-fill">
            <h3>Overview</h3>
            <div className="diagnostics-grid">
              <div className="diagnostic-item">
                <span className="muted-text">Workspaces</span>
                <div>{workspaces.length}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Chats</span>
                <div>{chats.length}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Requests</span>
                <div>{formatCompactNumber(totalRequests)}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Tokens</span>
                <div>{formatCompactNumber(totalTokens)}</div>
              </div>
            </div>
            <div className="settings-status muted-text">
              Active workspace: {activeWorkspace?.name ?? "none selected"}.
            </div>
          </section>
        </div>

        <section className="settings-card settings-card-gemini">
            <h3>Gemini</h3>
            <label className="field">
              <span>CLI path</span>
              <input
                value={settings?.cliPath ?? ""}
                onChange={(event) => void updateSettings({ cliPath: event.target.value })}
                placeholder="gemini"
              />
            </label>
            <div className="settings-status muted-text">{cliHealth?.message}</div>
            <div className="settings-actions">
              <button className="nav-button" onClick={() => void installCli()}>
                Install CLI
              </button>
              <button className="nav-button" onClick={() => void addWorkspace()}>
                Add workspace
              </button>
              <button className="nav-button" onClick={() => void openCliLogin()}>
                Open login terminal
              </button>
              <button className="nav-button" onClick={() => void recheckCli()}>
                Recheck
              </button>
            </div>
            <label className="field">
              <span>Preferred model</span>
              <CustomDropdown
                className="settings-model-dropdown"
                options={models.map((model) => ({ value: model.id, label: model.label }))}
                value={settings?.preferredModel ?? "auto"}
                onChange={(value) => void updateSettings({ preferredModel: value })}
                ariaLabel="Preferred model"
              />
            </label>
            <label className="field">
              <span>Sandbox mode</span>
              <CustomDropdown
                className="settings-model-dropdown"
                options={SANDBOX_MODE_OPTIONS}
                value={settings?.preferredSandboxMode ?? "off"}
                onChange={(value) => void updateSettings({ preferredSandboxMode: value as "off" | "auto" | "force" })}
                ariaLabel="Sandbox mode"
              />
            </label>
            <div className="settings-actions">
              <button className="nav-button" onClick={() => void setupSandbox()}>
                Setup sandbox
              </button>
            </div>
        </section>

        <section className="settings-card settings-card-updates">
          <h3>Application Updates</h3>
          <div className="diagnostics-grid">
            <div className="diagnostic-item">
              <span className="muted-text">Status</span>
              <div>{updateState.status} {updateState.version ? `(v${updateState.version})` : ""}</div>
            </div>
            {updateState.progress && (
              <div className="diagnostic-item">
                <span className="muted-text">Progress</span>
                <div>{Math.round(updateState.progress.percent)}%</div>
              </div>
            )}
          </div>
          {updateState.error && (
            <div className="settings-status" style={{ color: "var(--accent-red)", marginTop: "8px", fontSize: "0.95rem" }}>
              {updateState.error}
            </div>
          )}
          <div className="settings-actions" style={{ marginTop: "12px" }}>
            {updateState.status === "downloaded" ? (
              <button className="nav-button primary" onClick={() => void quitAndInstall()}>
                Restart to update
              </button>
            ) : (
              <button
                className="nav-button"
                onClick={() => void checkForUpdates()}
                disabled={updateState.status === "checking" || updateState.status === "downloading"}
              >
                {updateState.status === "checking" ? "Checking..." : updateState.status === "downloading" ? "Downloading..." : "Check for updates"}
              </button>
            )}
          </div>
          <p className="muted-text" style={{ marginTop: "12px", fontSize: "0.9rem", lineHeight: "1.4" }}>
            Updates are not digitally signed. Windows SmartScreen may show a warning - this is expected.
          </p>
        </section>

        <section className="settings-card settings-card-diagnostics">
            <h3>Diagnostics</h3>
            <div className="diagnostics-grid">
              <div className="diagnostic-item">
                <span className="muted-text">App</span>
                <div>{diagnostics?.appVersion ?? "-"}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Electron</span>
                <div>{diagnostics?.electronVersion ?? "-"}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">CLI status</span>
                <div>{diagnostics?.cliStatus ?? "-"}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Auth</span>
                <div>{diagnostics?.authState ?? "-"}</div>
              </div>
            </div>
            <div className="settings-actions" style={{ marginTop: "12px" }}>
              <button className="nav-button" onClick={() => void exportLogs()}>
                Export diagnostics log
              </button>
            </div>
        </section>
      </div>
    </div>
  );
}
