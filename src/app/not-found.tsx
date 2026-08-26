import Link from "next/link";

export default function NotFound() {
  return (
    <main className="workspace shell">
      <section className="empty-state">
        <p className="eyebrow">404</p>
        <h1>That view does not exist</h1>
        <p>
          No transaction data was changed. Return to the inspector and try
          another route.
        </p>
        <Link className="button" href="/safes">
          Open inspector
        </Link>
      </section>
    </main>
  );
}
