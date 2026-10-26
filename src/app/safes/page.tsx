import Link from "next/link";

import { supportedChainSummaries } from "@/adapters/chain-viem/config";
import { WalletAuthGate } from "@/components/auth/wallet-auth-gate";
import { WalletAuthProvider } from "@/components/auth/wallet-auth-provider";
import { SafesClient } from "@/components/safes/safes-client";
import { TransactionReviewForm } from "@/components/safes/transaction-review-form";

import { removeSafeBookmark } from "./actions";

export const metadata = { title: "Your Safes" };

export default function SafesPage() {
  return (
    <main className="workspace shell">
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
        <Link className="text-link" href="/">
          Return to overview
        </Link>
        <span>Public data only · No signing capability</span>
      </footer>
    </main>
  );
}
