"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { getPersistencePort } from "@/container";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import { AUTH_SESSION_COOKIE, parseAuthSession } from "@/lib/auth/session";

interface RemoveSafeBookmarkInput {
  readonly chainId: number;
  readonly address: string;
}

export interface RemoveSafeBookmarkResult {
  readonly ok: boolean;
  readonly error?: string;
}

export async function removeSafeBookmark(
  input: RemoveSafeBookmarkInput,
): Promise<RemoveSafeBookmarkResult> {
  const safe = safeRouteParamsSchema.safeParse(input);
  if (!safe.success) {
    return { ok: false, error: "The Safe bookmark is invalid." };
  }

  const cookieStore = await cookies();
  const session = parseAuthSession(cookieStore.get(AUTH_SESSION_COOKIE)?.value);
  if (!session) {
    return { ok: false, error: "Sign in with your wallet first." };
  }

  try {
    await getPersistencePort().unbookmarkSafe(session.profileId, safe.data);
    revalidatePath("/safes");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "The Safe could not be removed from this watchlist right now.",
    };
  }
}
