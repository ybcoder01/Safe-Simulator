import { NextRequest, NextResponse } from "next/server";

import {
  getAbiPort,
  getCachePort,
  getChainPort,
  getPersistencePort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import { resolveApprovalRisk } from "@/lib/api/approval-risk";
import { resolveContractInsight } from "@/lib/api/contract-insight";
import { resolveEvidenceVerdict } from "@/lib/api/evidence-verdict";
import { resolveExecutionInsight } from "@/lib/api/execution-insight";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { resolveStorageChangeAnalysis } from "@/lib/api/storage-changes";
import { resolveExecutionTokenMetadata } from "@/lib/api/token-metadata";
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
  const [insight, execution, addressBook] = await Promise.all([
    resolveContractInsight(safeData, abi, transaction),
    resolveExecutionInsight(
      getSimulationPort(),
      transaction,
      { cache, persistence },
      { chain, safeData },
    ),
    profileId
      ? persistence.listAddressBookEntries(profileId, safe.data)
      : Promise.resolve([]),
  ]);

  const [approvalRisk, tokenMetadata, storageAnalysis] = await Promise.all([
    resolveApprovalRisk(chain, transaction, insight, execution),
    resolveExecutionTokenMetadata(
      chain,
      cache,
      transaction.safe.chainId,
      execution,
    ),
    resolveStorageChangeAnalysis(abi, transaction.safe.chainId, execution),
  ]);
  const verdict = resolveEvidenceVerdict(
    transaction,
    insight,
    execution,
    addressBook,
    approvalRisk,
    storageAnalysis,
  );

  return NextResponse.json({
    data: {
      ...toTransactionView(transaction),
      insight,
      execution,
      approvalRisk,
      tokenMetadata,
      storageAnalysis,
      verdict,
    },
  });
}
