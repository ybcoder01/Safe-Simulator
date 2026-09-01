import { NextResponse } from "next/server";

import { getPersistencePort } from "@/container";
import {
  safeRouteParamsSchema,
  transactionPageQuerySchema,
} from "@/lib/api/safe-details";
import { resolveTransactionViews } from "@/lib/api/transaction-list";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const safe = safeRouteParamsSchema.safeParse(await context.params);
  const url = new URL(request.url);
  const query = transactionPageQuerySchema.safeParse({
    cursor: url.searchParams.get("cursor"),
    limit: url.searchParams.get("limit") ?? 25,
  });

  if (!safe.success || !query.success) {
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
  if (!(await persistence.findSafe(safe.data))) {
    return NextResponse.json(
      { error: { code: "safe_not_found", message: "Safe not found." } },
      { status: 404 },
    );
  }

  const page = await persistence.listTransactions(
    safe.data,
    query.data.cursor,
    query.data.limit,
  );
  const data = await resolveTransactionViews(
    persistence,
    safe.data,
    page.items,
  );
  return NextResponse.json({
    data,
    nextCursor: page.nextCursor,
  });
}
