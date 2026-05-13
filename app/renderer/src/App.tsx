import { Component, ReactNode, useEffect } from "react";
import { useAppStore } from "./store";
import { AppShell } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { LoadingScreen } from "./components/LoadingScreen";

class RendererErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message?: string }> {
  override state = { hasError: false, message: undefined as string | undefined };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message
    };
  }

  override componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("[renderer] error-boundary", error, errorInfo.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="centered-screen">
          <div className="auth-card">
            <h1>Renderer Error</h1>
            <p className="auth-copy">{this.state.message ?? "Renderer crashed while drawing the current screen."}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function App() {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const bootstrapped = useAppStore((state) => state.bootstrapped);
  const loading = useAppStore((state) => state.loading);
  const cliHealth = useAppStore((state) => state.cliHealth);
  const settings = useAppStore((state) => state.settings);
  const error = useAppStore((state) => state.error);
  const applyCliEvent = useAppStore((state) => state.applyCliEvent);

  useEffect(() => {
    void bootstrap();
    const unsubscribe = window.gemini.cli.onEvent((event) => {
      applyCliEvent(event);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  if (loading && !bootstrapped) {
    return <LoadingScreen label="Booting GeminiUI" />;
  }

  if (cliHealth && !cliHealth.installed) {
    return <AuthScreen mode="install" error={error} />;
  }

  if (cliHealth && !cliHealth.authenticated && !settings?.manualAuthConfirmed) {
    return <AuthScreen mode="login" error={error} />;
  }

  return (
    <RendererErrorBoundary>
      <AppShell />
    </RendererErrorBoundary>
  );
}
