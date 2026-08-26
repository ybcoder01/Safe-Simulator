"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="workspace shell">
      <section className="empty-state">
        <p className="eyebrow">Analysis interrupted</p>
        <h1>We could not load this view</h1>
        <p>
          The failure is explicit; no verdict has been inferred from incomplete
          data.
        </p>
        <button className="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
