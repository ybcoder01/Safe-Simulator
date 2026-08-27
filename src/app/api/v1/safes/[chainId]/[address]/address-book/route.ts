import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { getPersistencePort } from "@/container";
import {
  addressBookDeleteSchema,
  addressBookInputSchema,
  toAddressBookView,
} from "@/lib/api/address-book";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

function error(message: string, status: number, code: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

function sameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === request.nextUrl.origin;
}

async function context(request: NextRequest, route: RouteContext) {
  const safe = safeRouteParamsSchema.safeParse(await route.params);
  if (!safe.success) {
    return { failure: error("Invalid Safe route.", 400, "invalid_safe") };
  }

  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return {
      failure: error(
        "Import this Safe in the current browser before managing trust records.",
        403,
        "profile_required",
      ),
    };
  }

  return { safe: safe.data, profileId };
}

export async function GET(request: NextRequest, route: RouteContext) {
  const resolved = await context(request, route);
  if ("failure" in resolved) return resolved.failure;

  const items = await getPersistencePort().listAddressBookEntries(
    resolved.profileId,
    resolved.safe,
  );
  return NextResponse.json({ data: items.map(toAddressBookView) });
}

export async function PUT(request: NextRequest, route: RouteContext) {
  if (!sameOrigin(request)) {
    return error(
      "Cross-origin trust changes are rejected.",
      403,
      "origin_rejected",
    );
  }

  const resolved = await context(request, route);
  if ("failure" in resolved) return resolved.failure;

  try {
    const input = addressBookInputSchema.parse(await request.json());
    await getPersistencePort().setAddressBookEntry(
      resolved.profileId,
      resolved.safe,
      input.address,
      input.label,
      input.trust,
    );
    return NextResponse.json({ data: toAddressBookView(input) });
  } catch (cause) {
    if (cause instanceof ZodError) {
      return error(
        "The trust record is invalid.",
        400,
        "invalid_trust_record",
        cause.flatten(),
      );
    }
    return error(
      cause instanceof Error ? cause.message : "Could not save trust record.",
      403,
      "trust_record_rejected",
    );
  }
}

export async function DELETE(request: NextRequest, route: RouteContext) {
  if (!sameOrigin(request)) {
    return error("Cross-origin trust changes are rejected.", 403, "origin_rejected");
  }

  const resolved = await context(request, route);
  if ("failure" in resolved) return resolved.failure;

  try {
    const input = addressBookDeleteSchema.parse(await request.json());
    await getPersistencePort().removeAddressBookEntry(
      resolved.profileId,
      resolved.safe,
      input.address,
    );
    return NextResponse.json({ data: { removed: true } });
  } catch (cause) {
    if (cause instanceof ZodError) {
      return error(
        "The trust record is invalid.",
        400,
        "invalid_trust_record",
        cause.flatten(),
      );
    }
    return error("Could not remove trust record.", 502, "trust_remove_failed");
  }
}
