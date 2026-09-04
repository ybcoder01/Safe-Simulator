import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { classifyTransactionActivity } from "@/core/analysis/decoding/activity";
import type { TransactionSummaryRecord } from "@/core/domain";
import {
  getAbiPort,
  getCachePort,
  getChainPort,
  getPersistencePort,
  getRateLimitPort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import { decodedAddressFields } from "@/lib/api/decoded-addresses";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  TRANSACTION_SUMMARY_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  safeRouteParamsSchema,
  safeTransactionHashSchema,
} from "@/lib/api/safe-details";
import { isSafeBookmarked } from "@/lib/api/sync-refresh";
import { resolveTokenBalanceChanges } from "@/lib/api/token-balance-changes";
import { resolveExecutionTokenMetadata } from "@/lib/api/token-metadata";
import { resolveNeutralTransactionAnalysis } from "@/lib/api/transaction-analysis";
import {
  buildTransactionSummaryEvidence,
  configuredOpenRouterModel,
  requestTransactionSummary,
  TRANSACTION_SUMMARY_PROMPT_VERSION,
  transactionSummaryFingerprint,
  TransactionSummaryProviderError,
} from "@/lib/api/transaction-summary";
import {
  collectXdcContractReferences,
  resolveXdcContractVerification,
} from "@/lib/api/xdcscan-verification";

interface RouteContext {
  readonly params: Promise<{
    chainId: string;
    address: string;
    safeTxHash: string;
  }>;
}

function error(
  message: string,
  status: number,
  code: string,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    { error: { code, message } },
    headers ? { status, headers } : { status },
  );
}

function sameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === request.nextUrl.origin;
}

function view(record: TransactionSummaryRecord, cached: boolean) {
  return {
    id: record.id,
    safeTxHash: record.safeTxHash,
    promptVersion: record.promptVersion,
    model: record.model,
    status: record.status,
    summary: record.summary,
    usage: record.usage,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    cached,
  };
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!sameOrigin(request)) {
    return error(
      "Cross-origin summary requests are rejected.",
      403,
      "origin_rejected",
    );
  }

  const params = await context.params;
  const safe = safeRouteParamsSchema.safeParse(params);
  const safeTxHash = safeTransactionHashSchema.safeParse(params.safeTxHash);
  if (!safe.success || !safeTxHash.success) {
    return error("Invalid Safe transaction route.", 400, "invalid_transaction");
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    TRANSACTION_SUMMARY_RATE_LIMIT,
  );
  if (rateLimit.degraded) {
    return error(
      "Summary rate limiting is unavailable. Try again later.",
      503,
      "rate_limit_unavailable",
    );
  }
  if (!rateLimit.allowed) {
    return error(
      "Too many summary requests. Try again later.",
      429,
      "rate_limit_exceeded",
      rateLimitHeaders(TRANSACTION_SUMMARY_RATE_LIMIT, rateLimit),
    );
  }

  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return error(
      "Import this Safe in the current browser before requesting a summary.",
      403,
      "profile_required",
    );
  }

  const persistence = getPersistencePort();
  try {
    const bookmarked = await persistence.listSafesForProfile(profileId);
    if (!isSafeBookmarked(bookmarked, safe.data)) {
      return error(
        "This Safe is not available in the current watchlist.",
        404,
        "safe_not_bookmarked",
      );
    }

    const transaction = await persistence.findTransaction(
      safe.data,
      safeTxHash.data,
    );
    if (!transaction) {
      return error("Transaction not found.", 404, "transaction_not_found");
    }

    const cache = getCachePort();
    const chain = getChainPort();
    const safeData = getSafeDataPort();
    const analysis = await resolveNeutralTransactionAnalysis(transaction, {
      abi: getAbiPort(),
      cache,
      chain,
      persistence,
      safeData,
      simulation: getSimulationPort(),
      now: () => Math.floor(Date.now() / 1_000),
    });
    const [tokenMetadata, balanceChanges] = await Promise.all([
      resolveExecutionTokenMetadata(
        chain,
        cache,
        transaction.safe.chainId,
        analysis.execution,
      ),
      resolveTokenBalanceChanges(chain, transaction, analysis.execution),
    ]);
    const decoded = analysis.contract.decoded;
    const nestedCalls =
      decoded?.parameters.flatMap((parameter) => parameter.nestedCalls) ?? [];
    const decodedAddresses =
      decoded?.parameters.flatMap((parameter) =>
        decodedAddressFields(transaction.safe.chainId, parameter).map(
          (field) => field.address,
        ),
      ) ?? [];
    const contractVerification = await resolveXdcContractVerification(
      cache,
      transaction.safe.chainId,
      collectXdcContractReferences({
        transactionTarget: transaction.to,
        decodedAddresses,
        nestedTargets: nestedCalls.map((call) => call.to),
        traceTargets: [
          analysis.execution.rootCall?.to,
          ...analysis.execution.internalCalls.flatMap((call) => [
            call.from,
            call.to,
          ]),
        ],
        logEmitters: analysis.execution.logs.map((log) => log.address),
        storageContracts: analysis.execution.storageChanges.map(
          (change) => change.address,
        ),
        tokenContracts: analysis.execution.tokenMovements.map(
          (movement) => movement.token,
        ),
        approvalContracts: [
          ...analysis.approvalRisk.requests.flatMap((approval) => [
            approval.target,
            approval.token,
            approval.spender,
          ]),
          ...analysis.execution.allowanceChanges.flatMap((approval) => [
            approval.token,
            approval.spender,
          ]),
        ],
      }),
    );
    const evidence = buildTransactionSummaryEvidence({
      transaction,
      activity: classifyTransactionActivity(transaction),
      contract: analysis.contract,
      execution: analysis.execution,
      approvalRisk: analysis.approvalRisk,
      storageAnalysis: analysis.storageAnalysis,
      baselineVerdict: analysis.baselineVerdict,
      tokenMetadata,
      balanceChanges,
      contractVerification,
    });
    const evidenceFingerprint = transactionSummaryFingerprint(evidence);
    const model = configuredOpenRouterModel();
    const existing = await persistence.findTransactionSummary(
      safe.data,
      safeTxHash.data,
      evidenceFingerprint,
      TRANSACTION_SUMMARY_PROMPT_VERSION,
      model,
    );
    if (existing) {
      return NextResponse.json({ data: view(existing, true) });
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      return error(
        "Transaction summaries are not configured.",
        503,
        "summary_not_configured",
      );
    }

    const createdAt = Math.floor(Date.now() / 1_000);
    const pending: TransactionSummaryRecord = {
      id: randomUUID(),
      safe: safe.data,
      safeTxHash: safeTxHash.data,
      evidenceFingerprint,
      evidence,
      promptVersion: TRANSACTION_SUMMARY_PROMPT_VERSION,
      model,
      status: "pending",
      summary: null,
      usage: null,
      failureCode: null,
      createdAt,
      completedAt: null,
    };
    await persistence.saveTransactionSummary(pending);

    try {
      const result = await requestTransactionSummary(evidence, {
        apiKey,
        model,
      });
      const complete: TransactionSummaryRecord = {
        ...pending,
        status: "complete",
        summary: result.summary,
        usage: result.usage,
        completedAt: Math.floor(Date.now() / 1_000),
      };
      await persistence.saveTransactionSummary(complete);
      return NextResponse.json(
        { data: view(complete, false) },
        { status: 201 },
      );
    } catch (cause) {
      const failureCode =
        cause instanceof TransactionSummaryProviderError
          ? cause.code
          : "summary_failed";
      await persistence
        .saveTransactionSummary({
          ...pending,
          status: "failed",
          failureCode,
          completedAt: Math.floor(Date.now() / 1_000),
        })
        .catch(() => undefined);
      return error(
        cause instanceof TransactionSummaryProviderError &&
          cause.code === "timeout"
          ? "The summary request timed out. Try again."
          : "The summary could not be generated right now.",
        cause instanceof TransactionSummaryProviderError &&
          cause.code === "timeout"
          ? 504
          : 502,
        failureCode,
      );
    }
  } catch {
    return error(
      "The summary request could not be completed right now.",
      502,
      "summary_unavailable",
    );
  }
}
