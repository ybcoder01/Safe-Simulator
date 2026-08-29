"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getPersistencePort, getQueuePort } from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  isSafeBookmarked,
  refreshIdempotencyKey,
  type RefreshSyncState,
} from "@/lib/api/sync-refresh";
import {
  resolveSyncSummary,
  safeRouteParamsSchema,
} from "@/lib/api/safe-details";

interface RefreshSafeInput {
  readonly chainId: number;
  readonly address: string;
}

export async function requestSafeRefresh(
  input: RefreshSafeInput,
  _previousState: RefreshSyncState,
  _formData: FormData,
): Promise<RefreshSyncState> {
  const requestedAt = Date.now();
  const parsed = safeRouteParamsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "The Safe reference is invalid.",
      requestedAt,
    };
  }

  const cookieStore = await cookies();
  const profileId = parseProfileId(cookieStore.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return {
      status: "error",
      message: "This Safe is not available in the current watchlist.",
      requestedAt,
    };
  }

  try {
    const persistence = getPersistencePort();
    const bookmarkedSafes = await persistence.listSafesForProfile(profileId);
    if (!isSafeBookmarked(bookmarkedSafes, parsed.data)) {
      return {
        status: "error",
        message: "This Safe is not available in the current watchlist.",
        requestedAt,
      };
    }

    const sync = await resolveSyncSummary(persistence, parsed.data);
    if (sync.status === "syncing" || sync.status === "queued") {
      return {
        status: "running",
        message: "Synchronization is already queued or running.",
        requestedAt,
      };
    }

    await getQueuePort().enqueue(
      { type: "incremental-sync", safe: parsed.data },
      { idempotencyKey: refreshIdempotencyKey(parsed.data, requestedAt) },
    );
    revalidatePath(
      `/safe/${parsed.data.chainId}/${parsed.data.address.toLowerCase()}`,
    );

    return {
      status: "queued",
      message: "Refresh queued. This page will check for updated data.",
      requestedAt,
    };
  } catch {
    return {
      status: "error",
      message: "The refresh could not be queued right now.",
      requestedAt,
    };
  }
}
