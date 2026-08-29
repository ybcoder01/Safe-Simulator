import { NextResponse } from "next/server";

import { getPersistencePort } from "@/container";
import {
  messageHashSchema,
  toMessageView,
} from "@/lib/api/message-details";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";

interface RouteContext {
  readonly params: Promise<{
    chainId: string;
    address: string;
    messageHash: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const safeRef = safeRouteParamsSchema.safeParse(params);
  const messageHash = messageHashSchema.safeParse(params.messageHash);

  if (!safeRef.success || !messageHash.success) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_request",
          message: "Invalid Safe or message hash.",
        },
      },
      { status: 400 },
    );
  }

  const persistence = getPersistencePort();
  const [safe, message] = await Promise.all([
    persistence.findSafe(safeRef.data),
    persistence.findMessage(safeRef.data, messageHash.data),
  ]);
  if (!safe) {
    return NextResponse.json(
      { error: { code: "safe_not_found", message: "Safe not found." } },
      { status: 404 },
    );
  }
  if (!message) {
    return NextResponse.json(
      { error: { code: "message_not_found", message: "Message not found." } },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: toMessageView(message, safe.threshold) });
}
