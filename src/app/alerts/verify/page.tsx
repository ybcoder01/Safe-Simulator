import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isTelegramVerificationId } from "@/lib/api/telegram-alert-receipts";

interface PageProps {
  readonly searchParams: Promise<{ readonly code?: string | string[] }>;
}

export const metadata: Metadata = {
  title: "Verify Telegram alert | Safe Inspector",
  robots: { index: false, follow: false },
};

export default async function AlertVerificationStartPage({
  searchParams,
}: PageProps) {
  const query = await searchParams;
  const code = Array.isArray(query.code) ? query.code[0] : query.code;
  if (code && isTelegramVerificationId(code.trim())) {
    redirect(`/alerts/verify/${encodeURIComponent(code.trim())}`);
  }

  return (
    <main className="workspace shell alert-verification-shell">
      <header className="workspace-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </Link>
        <span className="read-only-pill">
          <i aria-hidden="true" /> Read-only by design
        </span>
      </header>

      <section className="alert-verification-card">
        <p className="eyebrow">Alert authenticity</p>
        <h1>Verify a Telegram alert</h1>
        <p className="alert-verification-lede">
          Type the verification ID shown in the Telegram message. For stronger
          protection against phishing, open this page from your own bookmark
          instead of following a message link.
        </p>
        <form className="alert-verification-form" method="get">
          <label htmlFor="alert-code">Alert verification ID</label>
          <div>
            <input
              autoComplete="off"
              id="alert-code"
              maxLength={32}
              minLength={32}
              name="code"
              pattern="[A-Za-z0-9_-]{32}"
              required
              spellCheck={false}
            />
            <button className="button" type="submit">
              Verify alert
            </button>
          </div>
        </form>
        {code ? (
          <p className="alert-verification-error" role="alert">
            That verification ID is not valid. Copy all 32 characters from the
            alert and try again.
          </p>
        ) : null}
      </section>
    </main>
  );
}
