import Link from "next/link";

import { SafeAppReportRedirect } from "@/components/safes/safe-app-report-redirect";
import {
  safeRouteParamsSchema,
  safeTransactionHashSchema,
} from "@/lib/api/safe-details";

interface ReportPageProps {
  readonly searchParams: Promise<{
    readonly chainId?: string;
    readonly address?: string;
    readonly safeTxHash?: string;
    readonly protocol?: string;
    readonly action?: string;
    readonly verdict?: string;
    readonly headline?: string;
  }>;
}

function displayValue(value: string | undefined, fallback: string) {
  return value?.trim().slice(0, 240) || fallback;
}

export default async function SafeAppReportPage({
  searchParams,
}: ReportPageProps) {
  const query = await searchParams;
  const safe = safeRouteParamsSchema.safeParse({
    chainId: query.chainId,
    address: query.address,
  });
  const safeTxHash = safeTransactionHashSchema.safeParse(query.safeTxHash);
  const protocol = displayValue(query.protocol, "Unidentified contract");
  const action = displayValue(query.action, "Raw transaction");
  const headline = displayValue(query.headline, "Transaction reviewed");
  const verdict = displayValue(query.verdict, "unverified");

  if (!safe.success) {
    return (
      <section className="safe-app-state" role="status">
        <p className="eyebrow">Safe Inspector</p>
        <h1>No transaction review is attached</h1>
        <p>
          Start from the automatic review page inside Safe Global, or use the
          manual Inspector.
        </p>
        <Link className="button button-secondary" href="/safe-app/manual">
          Open manual Inspector
        </Link>
      </section>
    );
  }

  if (!safeTxHash.success) {
    return (
      <section className="safe-app-state" role="status">
        <p className="eyebrow">Pre-signature review complete</p>
        <h1>{headline}</h1>
        <div className="simulation-metrics">
          <div>
            <span>Protocol</span>
            <strong>{protocol}</strong>
          </div>
          <div>
            <span>Action</span>
            <strong>{action}</strong>
          </div>
          <div>
            <span>Verdict</span>
            <strong>{verdict}</strong>
          </div>
        </div>
        <p>
          Complete the native confirmation in the Safe Global tab. This page
          will attach the Safe transaction hash and open the full report
          automatically.
        </p>
      </section>
    );
  }

  return (
    <SafeAppReportRedirect
      action={action}
      chainId={safe.data.chainId}
      headline={headline}
      protocol={protocol}
      safeAddress={safe.data.address}
      safeTxHash={safeTxHash.data}
      verdict={verdict}
    />
  );
}
