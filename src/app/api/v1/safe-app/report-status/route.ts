import { NextRequest, NextResponse } from "next/server";

import { getPersistencePort } from "@/container";
import {
  safeRouteParamsSchema,
  safeTransactionHashSchema,
} from "@/lib/api/safe-details";

export async function GET(request: NextRequest) {
  const chainId = request.nextUrl.searchParams.get("chainId");
  const address = request.nextUrl.searchParams.get("address");
  const safeTxHash = request.nextUrl.searchParams.get("safeTxHash");
  const safe = safeRouteParamsSchema.safeParse({ chainId, address });
  const hash = safeTransactionHashSchema.safeParse(safeTxHash);

  if (!safe.success || !hash.success) {
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

  const transaction = await getPersistencePort().findTransaction(
    safe.data,
    hash.data,
  );

  if (!transaction) {
    return NextResponse.json(
      {
        data: {
          ready: false,
          status: "syncing",
        },
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      ready: true,
      status: transaction.status,
    },
  });
}
