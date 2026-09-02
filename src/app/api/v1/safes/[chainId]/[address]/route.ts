import { NextRequest, NextResponse } from "next/server";

import { getPersistencePort, getSafeDataPort } from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  safeRouteParamsSchema,
  toBalanceView,
  toDetailedSafeView,
} from "@/lib/api/safe-details";
import { resolveTransactionViews } from "@/lib/api/transaction-list";

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

  const transactionViews = await resolveTransactionViews(
    persistence,
    safe,
    transactionPage.items,
  );

  return NextResponse.json({
    data: {
      safe: data,
      balances,
      transactions: transactionViews,
      nextCursor: transactionPage.nextCursor,
    },
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const parsed = safeRouteParamsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_safe", message: "Invalid Safe route." } },
      { status: 400 },
    );
  }

  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    await getPersistencePort().unbookmarkSafe(profileId, parsed.data);
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "upstream_unavailable",
          message:
            "The Safe could not be removed from this watchlist right now.",
        },
      },
      { status: 502 },
    );
  }
}
