import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { getChainPort, getPersistencePort } from "@/container";
import {
  addressBookDeleteSchema,
  addressBookInputSchema,
  toAddressBookReviewView,
} from "@/lib/api/address-book";
import { authSessionFromRequest } from "@/lib/auth/session";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

function error(
  message: string,
  status: number,
  code: string,
  details?: unknown,
) {
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

  const session = authSessionFromRequest(request);
  if (!session) {
    return {
      failure: error(
        "Sign in with your wallet before managing trust records.",
        401,
        "authentication_required",
      ),
    };
  }

  return { safe: safe.data, session };
}

async function requireSafeOwner(
  safe: { readonly chainId: number; readonly address: `0x${string}` },
  walletAddress: string,
) {
  const snapshot = await getChainPort().getSafeSnapshot(safe);
  await getPersistencePort().upsertSafe(snapshot);
  return snapshot.owners.some(
    (owner) => owner.toLowerCase() === walletAddress.toLowerCase(),
  );
}

export async function GET(request: NextRequest, route: RouteContext) {
  const resolved = await context(request, route);
  if ("failure" in resolved) return resolved.failure;

  const items = await getPersistencePort().listAddressBookReviews(
    resolved.session.profileId,
    resolved.safe,
  );
  return NextResponse.json({ data: items.map(toAddressBookReviewView) });
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

  if (
    !(await requireSafeOwner(resolved.safe, resolved.session.walletAddress))
  ) {
    return error(
      "Only a current Safe owner can add or change trusted addresses.",
      403,
      "safe_owner_required",
    );
  }

  try {
    const input = addressBookInputSchema.parse(await request.json());
    const persistence = getPersistencePort();
    await persistence.setAddressBookEntry(
      resolved.session.profileId,
      resolved.safe,
      input.address,
      input.label,
      input.trust,
      input.purpose,
    );
    const saved = (
      await persistence.listAddressBookReviews(
        resolved.session.profileId,
        resolved.safe,
      )
    ).find(
      (entry) => entry.address.toLowerCase() === input.address.toLowerCase(),
    );
    return NextResponse.json({
      data: saved ? toAddressBookReviewView(saved) : null,
    });
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
    return error(
      "Cross-origin trust changes are rejected.",
      403,
      "origin_rejected",
    );
  }

  const resolved = await context(request, route);
  if ("failure" in resolved) return resolved.failure;

  if (
    !(await requireSafeOwner(resolved.safe, resolved.session.walletAddress))
  ) {
    return error(
      "Only a current Safe owner can remove trusted addresses.",
      403,
      "safe_owner_required",
    );
  }

  try {
    const input = addressBookDeleteSchema.parse(await request.json());
    await getPersistencePort().removeAddressBookEntry(
      resolved.session.profileId,
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
