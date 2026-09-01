import { NextResponse } from "next/server";

import { getPersistencePort } from "@/container";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import {
  toTransferView,
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
  return NextResponse.json({
    data: page.items.map(toTransferView),
    nextCursor: page.nextCursor,
  });
}
