import Link from "next/link";
import { notFound } from "next/navigation";

import { ManualSimulationForm } from "@/components/safes/manual-simulation-form";
import { getPersistencePort } from "@/container";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";

interface PageProps {
  readonly params: Promise<{ chainId: string; address: string }>;
}

export default async function ManualSimulationPage({ params }: PageProps) {
  const parsed = safeRouteParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();

  const safe = await getPersistencePort().findSafe(parsed.data);
  if (!safe) notFound();

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

      <div className="simulation-page">
        <Link
          className="dashboard-back"
          href={`/safe/${safe.chainId}/${safe.address}`}
        >
          ← Safe overview
        </Link>
        <section className="simulation-hero">
          <p className="eyebrow">Pre-submission review</p>
          <h1>Simulate a draft call</h1>
          <p>
            Preview a target call from this Safe against latest chain state
            before creating a proposal. Nothing is signed, submitted, or
            broadcast.
          </p>
          <code>{safe.address}</code>
        </section>
        <ManualSimulationForm
          chainId={safe.chainId}
          safeAddress={safe.address}
        />
      </div>

      <footer className="workspace-footer">
        <Link
          className="text-link"
          href={`/safe/${safe.chainId}/${safe.address}`}
        >
          Return to Safe
        </Link>
        <span>Public data only · No signing capability</span>
      </footer>
    </main>
  );
}
