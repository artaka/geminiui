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
  const updateSettings = useAppStore((state) => state.updateSettings);
  const loadDiagnostics = useAppStore((state) => state.loadDiagnostics);
  const exportLogs = useAppStore((state) => state.exportLogs);
  const recheckCli = useAppStore((state) => state.recheckCli);
  const openCliLogin = useAppStore((state) => state.openCliLogin);
  const installCli = useAppStore((state) => state.installCli);
  const setupSandbox = useAppStore((state) => state.setupSandbox);
  const addWorkspace = useAppStore((state) => state.addWorkspace);
  const setScreen = useAppStore((state) => state.setScreen);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <div className="settings-title-block">
          <div className="eyebrow">Settings</div>
          <h2>GeminiApp configuration</h2>
          <p className="settings-intro">Tweak Gemini CLI integration, model defaults, and diagnostics without leaving the workspace.</p>
        </div>
        <button className="ghost-button settings-back-button" onClick={() => setScreen("chat")}>
          Back to chat
        </button>
      </div>

      <div className="settings-grid">
        <div className="settings-column">
          <section className="settings-card">
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
        </div>

        <div className="settings-column">
          <section className="settings-card">
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
                value={settings?.preferredSandboxMode ?? "auto"}
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
        </div>

        <section className="settings-card settings-card-wide">
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
          <button className="nav-button" onClick={() => void exportLogs()}>
            Export diagnostics log
          </button>
        </section>
      </div>
    </div>
  );
}
