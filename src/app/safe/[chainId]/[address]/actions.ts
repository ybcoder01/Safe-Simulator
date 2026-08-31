"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getPersistencePort, getQueuePort } from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  isRefreshActive,
  isSafeBookmarked,
  queuedRefreshCursors,
  refreshIdempotencyKey,
  refreshSyncStreams,
  restoredRefreshCursors,
  type RefreshSyncState,
} from "@/lib/api/sync-refresh";
import {
  safeRouteParamsSchema,
  summarizeSyncCursors,
} from "@/lib/api/safe-details";

interface RefreshSafeInput {
  readonly chainId: number;
  readonly address: string;
}

export async function requestSafeRefresh(
  input: RefreshSafeInput,
  previousState: RefreshSyncState,
  formData: FormData,
): Promise<RefreshSyncState> {
  void previousState;
  void formData;

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

    const currentCursors = await Promise.all(
      refreshSyncStreams.map((stream) =>
        persistence.findSyncCursor(parsed.data, stream),
      ),
    );
    const sync = summarizeSyncCursors(currentCursors);
    if (
      isRefreshActive(
        sync.status,
        sync.latestActivityAt,
        Math.floor(requestedAt / 1_000),
      )
    ) {
      return {
        status: "running",
        message: "Synchronization is already queued or running.",
        requestedAt,
      };
    }

    const requestedAtSeconds = Math.floor(requestedAt / 1_000);
    const queuedCursors = queuedRefreshCursors(
      parsed.data,
      currentCursors,
      requestedAtSeconds,
    );
    try {
      await Promise.all(
        queuedCursors.map((cursor) => persistence.saveSyncCursor(cursor)),
      );
      await getQueuePort().enqueue(
        { type: "incremental-sync", safe: parsed.data },
        { idempotencyKey: refreshIdempotencyKey(parsed.data, requestedAt) },
      );
    } catch (error) {
      const restoredCursors = restoredRefreshCursors(
        parsed.data,
        currentCursors,
        requestedAtSeconds,
      );
      await Promise.allSettled(
        restoredCursors.map((cursor) => persistence.saveSyncCursor(cursor)),
      );
      throw error;
    }

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
