import { notFound } from "next/navigation";

import { SafeAppReview } from "@/components/safes/safe-app-review";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Review and propose · Safe Inspector Preview",
  description:
    "Review an unsigned Safe transaction before opening Safe's confirmation screen.",
};

export default function SafeAppPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();

  return (
    <main className="safe-app-shell">
      <header className="safe-app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </div>
        <span className="preview-pill">Preview only</span>
      </header>
      <SafeAppReview />
      <footer className="safe-app-footer">
        Analysis happens before Safe opens its native confirmation screen. Safe
        Inspector never receives a private key.
      </footer>
    </main>
  );
}
