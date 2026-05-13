import { useEffect } from "react";
import { useAppStore } from "../store";

export function DiagnosticsView() {
  const diagnostics = useAppStore((state) => state.diagnostics);
  const cliHealth = useAppStore((state) => state.cliHealth);
  const environment = useAppStore((state) => state.environment);
  const loadDiagnostics = useAppStore((state) => state.loadDiagnostics);
  const exportLogs = useAppStore((state) => state.exportLogs);
  const setScreen = useAppStore((state) => state.setScreen);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <div className="settings-title-block">
          <div className="eyebrow">Diagnostics</div>
          <h2>System status & logs</h2>
          <p className="settings-intro">Detailed health information about GeminiApp, Electron runtime, and Gemini CLI integration.</p>
        </div>
        <button className="ghost-button settings-back-button" onClick={() => setScreen("chat")}>
          Back to chat
        </button>
      </div>

      <div className="settings-grid">
        <div className="settings-column">
          <section className="settings-card">
            <h3>App Environment</h3>
            <div className="diagnostics-grid">
              <div className="diagnostic-item">
                <span className="muted-text">App Version</span>
                <div>{diagnostics?.appVersion ?? "Loading..."}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Electron</span>
                <div>{diagnostics?.electronVersion ?? "Loading..."}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Platform</span>
                <div>{window.navigator.platform || "win32"}</div>
              </div>
            </div>
          </section>

          <section className="settings-card">
            <h3>Gemini CLI</h3>
            <div className="diagnostics-grid">
              <div className="diagnostic-item">
                <span className="muted-text">Status</span>
                <div className={`status-label status-${diagnostics?.cliStatus}`}>{diagnostics?.cliStatus}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Path</span>
                <div className="workspace-path" title={diagnostics?.cliPath}>{diagnostics?.cliPath}</div>
              </div>
              <div className="diagnostic-item">
                <span className="muted-text">Version</span>
                <div>{cliHealth?.version ?? "Not detected"}</div>
              </div>
            </div>
            {cliHealth?.warnings && cliHealth.warnings.length > 0 ? (
              <div className="env-list" style={{ marginTop: "12px" }}>
                {cliHealth.warnings.map((warning, i) => (
                  <div key={i} className="env-item warn">{warning}</div>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <div className="settings-column">
          <section className="settings-card">
            <h3>Dependencies</h3>
            {environment ? (
              <div className="env-list">
                {environment.dependencies.map((dependency) => (
                  <div key={dependency.id} className={`env-item ${dependency.installed ? "ok" : "warn"}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{dependency.name}</strong>
                      <span className="muted-text">{dependency.installed ? "Installed" : "Missing"}</span>
                    </div>
                    {!dependency.installed && <p className="muted-text" style={{ margin: "4px 0 0", fontSize: "12px" }}>{dependency.installHint}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted-text">Loading dependency status...</p>
            )}
          </section>

          <section className="settings-card">
            <h3>Actions</h3>
            <div className="settings-actions" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <button className="nav-button" onClick={() => void exportLogs()}>
                Export diagnostics bundle
              </button>
              <button className="nav-button" onClick={() => void loadDiagnostics()}>
                Refresh snapshot
              </button>
            </div>
            <p className="muted-text" style={{ marginTop: "12px", fontSize: "12px" }}>
              Exporting logs will create a JSON file with non-sensitive application state for troubleshooting.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
