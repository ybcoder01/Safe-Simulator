import { SafeAppReview } from "@/components/safes/safe-app-review";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review before signing · Safe Inspector",
  description:
    "Review an unsigned Safe transaction before opening Safe's confirmation screen.",
};

export default function SafeAppPage() {
  const isPreview = process.env.VERCEL_ENV === "preview";

  return (
    <main className="safe-app-shell">
      <header className="safe-app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </div>
        {isPreview ? <span className="preview-pill">Preview only</span> : null}
      </header>
      <SafeAppReview />
      <footer className="safe-app-footer">
        <span>
          Analysis happens before Safe opens its native confirmation screen.
          Safe Inspector never receives a private key.
        </span>
      </footer>
    </main>
  );
}
