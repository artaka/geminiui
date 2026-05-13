import { useAppStore } from "../store";

export function AuthScreen(props: { error?: string; mode: "install" | "login" }) {
  const cliHealth = useAppStore((state) => state.cliHealth);
  const checkingCli = useAppStore((state) => state.checkingCli);
  const environment = useAppStore((state) => state.environment);
  const installCli = useAppStore((state) => state.installCli);
  const openCliLogin = useAppStore((state) => state.openCliLogin);
  const recheckCli = useAppStore((state) => state.recheckCli);
  const confirmCliAuth = useAppStore((state) => state.confirmCliAuth);
  const isInstallMode = props.mode === "install";

  return (
    <div className="centered-screen">
      <div className="auth-card">
        <div className="eyebrow">GeminiUI</div>
        <h1>{isInstallMode ? "Install Gemini CLI" : "Authorize Gemini CLI"}</h1>
        <p className="auth-copy">
          {isInstallMode
            ? "GeminiUI works through the local Gemini CLI. The app did not detect a usable CLI yet, so install it first or point settings to the correct executable."
            : "GeminiUI detected Gemini CLI, but the CLI is not ready for requests yet. Complete login in Gemini itself, then return here and recheck."}
        </p>
        <div className="onboarding-steps">
          {isInstallMode ? (
            <>
              <div>1. Install Gemini CLI.</div>
              <div>2. Recheck until the client is detected.</div>
              <div>3. Then continue to the Gemini login step.</div>
            </>
          ) : (
            <>
              <div>1. Open Gemini CLI in a terminal window.</div>
              <div>2. In Gemini, choose Sign in with Google.</div>
              <div>3. Finish browser authentication.</div>
              <div>4. Return here and recheck until the client is connected.</div>
            </>
          )}
        </div>
        {isInstallMode ? (
          <button className="cta-button" onClick={() => void installCli()}>
            Install available dependencies
          </button>
        ) : (
          <button className="cta-button" onClick={() => void openCliLogin()}>
            Open Gemini CLI terminal
          </button>
        )}
        {!isInstallMode ? null : (
          <button className="nav-button" onClick={() => void openCliLogin()}>
            Open Gemini CLI terminal
          </button>
        )}
        {isInstallMode ? null : (
          <button className="nav-button" onClick={() => void confirmCliAuth()}>
            I already signed in
          </button>
        )}
        <button className="nav-button" onClick={() => void recheckCli()}>
          {checkingCli ? "Checking..." : "Recheck Gemini CLI"}
        </button>
        <p className="muted-text">{cliHealth?.message ?? "Checking Gemini CLI..."}</p>
        {environment ? (
          <div className="env-list">
            {environment.dependencies.map((dependency) => (
              <div key={dependency.id} className={`env-item ${dependency.installed ? "ok" : "warn"}`}>
                <strong>{dependency.name}</strong>: {dependency.message}
              </div>
            ))}
          </div>
        ) : null}
        {props.error ? <div className="error-banner">{props.error}</div> : null}
      </div>
    </div>
  );
}
