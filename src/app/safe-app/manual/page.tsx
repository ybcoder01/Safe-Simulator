import Link from "next/link";
import { notFound } from "next/navigation";

import { supportedChainSummaries } from "@/adapters/chain-viem/config";
import { WalletAuthGate } from "@/components/auth/wallet-auth-gate";
import { WalletAuthProvider } from "@/components/auth/wallet-auth-provider";
import { SafesClient } from "@/components/safes/safes-client";
import { TransactionReviewForm } from "@/components/safes/transaction-review-form";

import { removeSafeBookmark } from "../../safes/actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manual Inspector · Safe Inspector Preview",
  description:
    "Open the full read-only Safe Inspector manually, inside or outside Safe Global.",
};

export default function ManualSafeInspectorPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();

  return (
    <main className="workspace shell">
      <header className="workspace-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </Link>
        <div className="safe-app-header-actions">
          <nav className="safe-app-mode-nav" aria-label="Safe Inspector mode">
            <Link href="/safe-app">Automatic review</Link>
            <span aria-current="page">Manual inspector</span>
          </nav>
          <span className="preview-pill">Preview only</span>
        </div>
      </header>
      <WalletAuthProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID}>
        <WalletAuthGate
          configured={Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID)}
        >
          <SafesClient
            chains={supportedChainSummaries}
            removeSafe={removeSafeBookmark}
            reviewForm={
              <TransactionReviewForm chains={supportedChainSummaries} />
            }
          />
        </WalletAuthGate>
      </WalletAuthProvider>
      <footer className="workspace-footer">
        <Link className="text-link" href="/safe-app">
          Return to automatic review
        </Link>
        <span>Public data only · No signing capability</span>
      </footer>
    </main>
  );
}
