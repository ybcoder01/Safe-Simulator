import { NextRequest, NextResponse } from "next/server";

import {
  getCachePort,
  getChainPort,
  getPersistencePort,
  getRateLimitPort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import { resolveExecutionInsight } from "@/lib/api/execution-insight";
import { resolveOptionalLivePayload } from "@/lib/api/optional-live-payload";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  TRANSACTION_PROGRESSIVE_EVIDENCE_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import {
  safeRouteParamsSchema,
  safeTransactionHashSchema,
} from "@/lib/api/safe-details";
import {
  type TokenBalanceChangeResult,
  resolveTokenBalanceChanges,
} from "@/lib/api/token-balance-changes";

const BALANCE_EVIDENCE_TIMEOUT_MS = 8_000;

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

function unavailableBalanceEvidence(): TokenBalanceChangeResult {
  return {
    items: [],
    totalPairs: 0,
    limited: false,
    anchor: {
      type: "unavailable",
      beforeBlock: null,
      afterBlock: null,
    },
    warnings: [
      "Balance evidence did not finish within its presentation-only time limit.",
    ],
  };
}

async function boundedBalanceEvidence(
  task: Promise<TokenBalanceChangeResult>,
): Promise<TokenBalanceChangeResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task.catch(() => unavailableBalanceEvidence()),
      new Promise<TokenBalanceChangeResult>((resolve) => {
        timeout = setTimeout(
          () => resolve(unavailableBalanceEvidence()),
          BALANCE_EVIDENCE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Presentation-only transaction evidence. The deterministic security report is
 * already rendered before the browser requests these optional Safe-service and
 * balanceOf details.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return error(
      "Cross-origin transaction evidence requests are rejected.",
      403,
      "origin_rejected",
    );
  }

  const body = await request.json().catch(() => null);
  const safe = safeRouteParamsSchema.safeParse(body);
  const hash = safeTransactionHashSchema.safeParse(body?.safeTxHash);
  if (!safe.success || !hash.success) {
    return error("Invalid transaction evidence request.", 400, "invalid_request");
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    TRANSACTION_PROGRESSIVE_EVIDENCE_RATE_LIMIT,
  );
  if (rateLimit.degraded) {
    return error(
      "Transaction evidence rate limiting is unavailable. Try again later.",
      503,
      "rate_limit_unavailable",
    );
  }
  if (!rateLimit.allowed) {
    return error(
      "Too many transaction evidence requests. Try again later.",
      429,
      "rate_limit_exceeded",
      rateLimitHeaders(TRANSACTION_PROGRESSIVE_EVIDENCE_RATE_LIMIT, rateLimit),
    );
  }

  const persistence = getPersistencePort();
  const transaction = await persistence.findTransaction(safe.data, hash.data);
  if (!transaction) {
    return error("Transaction not found.", 404, "not_found");
  }

  const cache = getCachePort();
  const chain = getChainPort();
  const safeData = getSafeDataPort();
  const [rawPayload, execution] = await Promise.all([
    resolveOptionalLivePayload(safeData, safe.data, hash.data),
    resolveExecutionInsight(
      getSimulationPort(),
      transaction,
      { cache, persistence },
      { chain, safeData },
    ),
  ]);
  const balanceChanges = await boundedBalanceEvidence(
    resolveTokenBalanceChanges(chain, transaction, execution),
  );

  return NextResponse.json({
    data: {
      rawPayload: rawPayload
        ? {
            safeTxGas: rawPayload.safeTxGas.toString(),
            baseGas: rawPayload.baseGas.toString(),
            gasPrice: rawPayload.gasPrice.toString(),
            gasToken: rawPayload.gasToken,
            refundReceiver: rawPayload.refundReceiver,
          }
        : null,
      balanceChanges,
    },
  });
}
