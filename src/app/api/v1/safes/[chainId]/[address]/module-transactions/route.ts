import { NextResponse } from "next/server";

import { getPersistencePort } from "@/container";
import {
  moduleTransactionPageQuerySchema,
  toModuleTransactionView,
} from "@/lib/api/module-activity";
import { MODULE_ANALYSIS_ENGINE_VERSION } from "@/lib/api/module-analysis";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const safeRef = safeRouteParamsSchema.safeParse(await context.params);
  const url = new URL(request.url);
  const query = moduleTransactionPageQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor"),
    limit: url.searchParams.get("limit") ?? 25,
  });

  if (!safeRef.success || !query.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "Invalid Safe or pagination parameters.",
        },
      },
      { status: 400 },
    );
  }

  const persistence = getPersistencePort();
  const safe = await persistence.findSafe(safeRef.data);
  if (!safe) {
    return NextResponse.json(
      { error: { code: "safe_not_found", message: "Safe not found." } },
      { status: 404 },
    );
  }

  const page = await persistence.listModuleTransactions(
    safe,
    query.data.cursor,
    query.data.limit,
  );
  const analyses = await persistence.findModuleAnalyses(
    safe,
    page.items.map((transaction) => transaction.transactionHash),
    MODULE_ANALYSIS_ENGINE_VERSION,
  );
  const analysesByHash = new Map(
    analyses.map((analysis) => [
      analysis.transactionHash.toLowerCase(),
      analysis,
    ]),
  );

  return NextResponse.json({
    data: page.items.map((transaction) =>
      toModuleTransactionView(
        transaction,
        analysesByHash.get(transaction.transactionHash.toLowerCase()) ?? null,
      ),
    ),
    nextCursor: page.nextCursor,
  });
}
