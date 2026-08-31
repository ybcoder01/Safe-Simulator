type LoadingVariant = "watchlist" | "dashboard" | "detail";

interface RouteLoadingStateProps {
  readonly variant: LoadingVariant;
}

const labels: Record<LoadingVariant, string> = {
  watchlist: "Loading Safe watchlist",
  dashboard: "Loading Safe dashboard",
  detail: "Loading Safe activity details",
};

export function RouteLoadingState({ variant }: RouteLoadingStateProps) {
  return (
    <main className="workspace shell">
      <header className="workspace-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </div>
        <span className="read-only-pill">
          <i aria-hidden="true" /> Read-only by design
        </span>
      </header>

      <div
        aria-busy="true"
        aria-live="polite"
        className={`route-loading route-loading-${variant}`}
        role="status"
      >
        <span className="loading-status-text">{labels[variant]}</span>

        <section className="loading-heading" aria-hidden="true">
          <div>
            <span className="loading-bar loading-bar-eyebrow" />
            <span className="loading-bar loading-bar-title" />
            <span className="loading-bar loading-bar-address" />
          </div>
          <span className="loading-bar loading-bar-pill" />
        </section>

        <section className="loading-metrics" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index}>
              <span className="loading-bar loading-bar-label" />
              <span className="loading-bar loading-bar-value" />
            </div>
          ))}
        </section>

        <section className="loading-columns" aria-hidden="true">
          {Array.from({ length: 2 }, (_, column) => (
            <div className="loading-panel" key={column}>
              <span className="loading-bar loading-bar-panel-title" />
              {Array.from({ length: 3 }, (_, row) => (
                <span className="loading-bar loading-bar-row" key={row} />
              ))}
            </div>
          ))}
        </section>

        <section className="loading-panel loading-activity" aria-hidden="true">
          <span className="loading-bar loading-bar-panel-title" />
          {Array.from({ length: 3 }, (_, row) => (
            <span className="loading-bar loading-bar-activity-row" key={row} />
          ))}
        </section>
      </div>
    </main>
  );
}
