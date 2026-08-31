"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { getPersistencePort } from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";

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
  const profileId = parseProfileId(cookieStore.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return { ok: false, error: "This watchlist session is unavailable." };
  }

  try {
    await getPersistencePort().unbookmarkSafe(profileId, safe.data);
    revalidatePath("/safes");
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "The Safe could not be removed from this watchlist right now.",
    };
  }
}
