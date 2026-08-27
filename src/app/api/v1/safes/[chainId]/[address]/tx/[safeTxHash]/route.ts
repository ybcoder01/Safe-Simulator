import { NextResponse } from "next/server";

import {
  getAbiPort,
  getPersistencePort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import { resolveContractInsight } from "@/lib/api/contract-insight";
import { resolveExecutionInsight } from "@/lib/api/execution-insight";
import {
  safeRouteParamsSchema,
  safeTransactionHashSchema,
  toTransactionView,
} from "@/lib/api/safe-details";

interface RouteContext {
  readonly params: Promise<{
    chainId: string;
    address: string;
    safeTxHash: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const safe = safeRouteParamsSchema.safeParse(params);
  const safeTxHash = safeTransactionHashSchema.safeParse(params.safeTxHash);

  if (!safe.success || !safeTxHash.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_transaction",
          message: "Invalid Safe transaction route.",
        },
      },
      { status: 400 },
    );
  }

  const transaction = await getPersistencePort().findTransaction(
    safe.data,
    safeTxHash.data,
  );
  if (!transaction) {
    return NextResponse.json(
      {
        error: {
          code: "transaction_not_found",
          message: "Transaction not found.",
        },
      },
      { status: 404 },
    );
  }

  const [insight, execution] = await Promise.all([
    resolveContractInsight(getSafeDataPort(), getAbiPort(), transaction),
    resolveExecutionInsight(getSimulationPort(), transaction),
  ]);

  return NextResponse.json({
    data: { ...toTransactionView(transaction), insight, execution },
  });
}
