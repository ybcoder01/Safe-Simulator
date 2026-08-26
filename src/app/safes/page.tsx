import Link from "next/link";

import { supportedChainSummaries } from "@/adapters/chain-viem/config";
import { SafesClient } from "@/components/safes/safes-client";

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
      <SafesClient chains={supportedChainSummaries} />
      <footer className="workspace-footer">
        <Link className="text-link" href="/">
          Return to overview
        </Link>
        <span>Public data only · No signing capability</span>
      </footer>
    </main>
  );
}
