import { NextResponse } from "next/server";

import { getPersistencePort, getSafeDataPort } from "@/container";
import {
  safeRouteParamsSchema,
  toBalanceView,
  toDetailedSafeView,
  toTransactionView,
} from "@/lib/api/safe-details";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const parsed = safeRouteParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_safe", message: "Invalid Safe route." } },
      { status: 400 },
    );
  }

  const persistence = getPersistencePort();
  const safe = await persistence.findSafe(parsed.data);
  if (!safe) {
    return NextResponse.json(
      { error: { code: "safe_not_found", message: "Safe not found." } },
      { status: 404 },
    );
  }

  const [data, transactionPage, balances] = await Promise.all([
    toDetailedSafeView(persistence, safe),
    persistence.listTransactions(safe, null, 25),
    getSafeDataPort()
      .getBalances(safe)
      .then((items) => items.map(toBalanceView))
      .catch(() => null),
  ]);

  return NextResponse.json({
    data: {
      safe: data,
      balances,
      transactions: transactionPage.items.map(toTransactionView),
      nextCursor: transactionPage.nextCursor,
    },
  });
}
