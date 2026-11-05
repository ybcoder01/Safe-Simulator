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
  }>;
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

  if (!safe.success || !safeTxHash.success) {
    return (
      <section className="safe-app-state" role="status">
        <p className="eyebrow">Report tab ready</p>
        <h1>Complete the Safe confirmation</h1>
        <p>
          Keep this tab open. After Safe creates the transaction, Safe Inspector
          will attach its transaction hash and open the full report here
          automatically.
        </p>
        <Link className="button button-secondary" href="/safe-app/manual">
          Open manual Inspector
        </Link>
      </section>
    );
  }

  return (
    <SafeAppReportRedirect
      chainId={safe.data.chainId}
      safeAddress={safe.data.address}
      safeTxHash={safeTxHash.data}
    />
  );
}
