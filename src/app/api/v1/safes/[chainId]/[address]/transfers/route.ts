import { NextResponse } from "next/server";

import { getCachePort, getChainPort, getPersistencePort } from "@/container";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import {
  resolveTransferViews,
  transferPageQuerySchema,
} from "@/lib/api/transfer-activity";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const safeRef = safeRouteParamsSchema.safeParse(await context.params);
  const url = new URL(request.url);
  const query = transferPageQuerySchema.safeParse({
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

  const page = await persistence.listTransfers(
    safe,
    query.data.cursor,
    query.data.limit,
  );
  const data = await resolveTransferViews(
    getChainPort(),
    getCachePort(),
    page.items,
  );
  return NextResponse.json({
    data,
    nextCursor: page.nextCursor,
  });
}
