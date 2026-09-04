import { NextRequest, NextResponse } from "next/server";

import {
  getAbiPort,
  getCachePort,
  getChainPort,
  getPersistencePort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import { resolveEvidenceVerdict } from "@/lib/api/evidence-verdict";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  safeRouteParamsSchema,
  safeTransactionHashSchema,
  toTransactionView,
} from "@/lib/api/safe-details";
import { resolveTokenBalanceChanges } from "@/lib/api/token-balance-changes";
import { resolveExecutionTokenMetadata } from "@/lib/api/token-metadata";
import { resolveNeutralTransactionAnalysis } from "@/lib/api/transaction-analysis";

interface RouteContext {
  readonly params: Promise<{
    chainId: string;
    address: string;
    safeTxHash: string;
  }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
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

  const persistence = getPersistencePort();
  const cache = getCachePort();
  const transaction = await persistence.findTransaction(
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

  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  const chain = getChainPort();
  const safeData = getSafeDataPort();
  const abi = getAbiPort();
  const [analysis, addressBook] = await Promise.all([
    resolveNeutralTransactionAnalysis(transaction, {
      abi,
      cache,
      chain,
      persistence,
      safeData,
      simulation: getSimulationPort(),
      now: () => Math.floor(Date.now() / 1_000),
    }),
    profileId
      ? persistence.listAddressBookEntries(profileId, safe.data)
      : Promise.resolve([]),
  ]);
  const [tokenMetadata, balanceChanges] = await Promise.all([
    resolveExecutionTokenMetadata(
      chain,
      cache,
      transaction.safe.chainId,
      analysis.execution,
    ),
    resolveTokenBalanceChanges(chain, transaction, analysis.execution),
  ]);
  const verdict = resolveEvidenceVerdict(
    transaction,
    analysis.contract,
    analysis.execution,
    addressBook,
    analysis.approvalRisk,
    analysis.storageAnalysis,
  );

  return NextResponse.json({
    data: {
      ...toTransactionView(transaction, {
        baselineVerdict: analysis.persisted.verdict,
        analyzedAt: analysis.persisted.createdAt,
        immutable: analysis.persisted.immutable,
      }),
      insight: analysis.contract,
      execution: analysis.execution,
      approvalRisk: analysis.approvalRisk,
      tokenMetadata,
      balanceChanges,
      storageAnalysis: analysis.storageAnalysis,
      verdict,
    },
  });
}
