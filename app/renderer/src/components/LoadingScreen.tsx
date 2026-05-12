export function LoadingScreen(props: { label: string }) {
  return (
    <div className="centered-screen">
      <div className="loading-card">
        <div className="spinner" />
        <div>{props.label}</div>
      </div>
    </div>
  );
}
