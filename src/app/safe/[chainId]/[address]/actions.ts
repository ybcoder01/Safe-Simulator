"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import {
  getChainPort,
  getPersistencePort,
  getQueuePort,
  getSafeDataPort,
} from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  reanalysisRequestIdempotencyKey,
  type ReanalysisRequestState,
} from "@/lib/api/reanalysis-request";
import {
  isSafeBookmarked,
  isQueueCapacityError,
  queueSafeRefresh,
  refreshSafeDirectly,
  type RefreshSyncState,
} from "@/lib/api/sync-refresh";
import { MODULE_ANALYSIS_ENGINE_VERSION } from "@/lib/api/module-analysis";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/transaction-analysis";

interface SafeActionInput {
  readonly chainId: number;
  readonly address: string;
}

export async function requestSafeRefresh(
  input: SafeActionInput,
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

    const result = await queueSafeRefresh(
      persistence,
      getQueuePort(),
      parsed.data,
      requestedAt,
    );
    if (result.status === "running") {
      return {
        status: "running",
        message: "Synchronization is already queued or running.",
        requestedAt,
      };
    }

    revalidatePath(
      `/safe/${parsed.data.chainId}/${parsed.data.address.toLowerCase()}`,
    );

    return {
      status: "queued",
      message: "Refresh queued. This page will check for updated data.",
      requestedAt,
    };
  } catch (queueError) {
    if (!isQueueCapacityError(queueError)) {
      console.error("[safe-refresh] queue publication failed", {
        chainId: parsed.data.chainId,
        safe: parsed.data.address,
        error:
          queueError instanceof Error
            ? { name: queueError.name, message: queueError.message }
            : { message: String(queueError) },
      });
      return {
        status: "error",
        message: "The refresh could not be queued right now.",
        requestedAt,
      };
    }

    try {
      const persistence = getPersistencePort();
      const direct = await refreshSafeDirectly(parsed.data, {
        chain: getChainPort(),
        persistence,
        queue: getQueuePort(),
        safeData: getSafeDataPort(),
        analysisEngineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
        moduleAnalysisEngineVersion: MODULE_ANALYSIS_ENGINE_VERSION,
        now: () => Math.floor(Date.now() / 1_000),
      });
      console.warn("[safe-refresh] queue unavailable; used direct fallback", {
        chainId: parsed.data.chainId,
        safe: parsed.data.address,
        completeStreams: direct.completeStreams,
        totalStreams: direct.totalStreams,
        queueError:
          queueError instanceof Error
            ? { name: queueError.name, message: queueError.message }
            : { message: String(queueError) },
      });
      revalidatePath(
        `/safe/${parsed.data.chainId}/${parsed.data.address.toLowerCase()}`,
      );
      return {
        status: "running",
        message:
          direct.completeStreams === direct.totalStreams
            ? "Latest Safe data refreshed directly while background delivery is busy."
            : `Latest activity was refreshed for ${direct.completeStreams} of ${direct.totalStreams} streams. Retry later for older history.`,
        requestedAt,
      };
    } catch (directError) {
      console.error("[safe-refresh] direct fallback failed", {
        chainId: parsed.data.chainId,
        safe: parsed.data.address,
        queueError:
          queueError instanceof Error
            ? { name: queueError.name, message: queueError.message }
            : { message: String(queueError) },
        directError:
          directError instanceof Error
            ? { name: directError.name, message: directError.message }
            : { message: String(directError) },
      });
      return {
        status: "error",
        message: "The refresh could not run right now.",
        requestedAt,
      };
    }
  }
}

export async function requestSafeReanalysis(
  input: SafeActionInput,
  previousState: ReanalysisRequestState,
  formData: FormData,
): Promise<ReanalysisRequestState> {
  void previousState;
  void formData;

  const parsed = safeRouteParamsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "The Safe reference is invalid.",
    };
  }

  const cookieStore = await cookies();
  const profileId = parseProfileId(cookieStore.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return {
      status: "error",
      message: "This Safe is not available in the current watchlist.",
    };
  }

  try {
    const bookmarkedSafes =
      await getPersistencePort().listSafesForProfile(profileId);
    if (!isSafeBookmarked(bookmarkedSafes, parsed.data)) {
      return {
        status: "error",
        message: "This Safe is not available in the current watchlist.",
      };
    }

    const requestId = reanalysisRequestIdempotencyKey(
      parsed.data,
      TRANSACTION_ANALYSIS_ENGINE_VERSION,
    );
    await getQueuePort().enqueue(
      {
        type: "reanalyze",
        safe: parsed.data,
        engineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
        runId: requestId,
        cursor: null,
        page: 0,
      },
      { idempotencyKey: requestId },
    );

    return {
      status: "queued",
      message:
        "History analysis queued in small batches. Open a transaction later to view its latest evidence.",
    };
  } catch {
    return {
      status: "error",
      message: "History analysis could not be queued right now.",
    };
  }
}

export async function requestSafeModuleReanalysis(
  input: SafeActionInput,
  previousState: ReanalysisRequestState,
  formData: FormData,
): Promise<ReanalysisRequestState> {
  void previousState;
  void formData;

  const parsed = safeRouteParamsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "The Safe reference is invalid.",
    };
  }

  const cookieStore = await cookies();
  const profileId = parseProfileId(cookieStore.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return {
      status: "error",
      message: "This Safe is not available in the current watchlist.",
    };
  }

  try {
    const bookmarkedSafes =
      await getPersistencePort().listSafesForProfile(profileId);
    if (!isSafeBookmarked(bookmarkedSafes, parsed.data)) {
      return {
        status: "error",
        message: "This Safe is not available in the current watchlist.",
      };
    }

    const requestId = `module:${reanalysisRequestIdempotencyKey(
      parsed.data,
      MODULE_ANALYSIS_ENGINE_VERSION,
    )}`;
    await getQueuePort().enqueue(
      {
        type: "reanalyze-module",
        safe: parsed.data,
        engineVersion: MODULE_ANALYSIS_ENGINE_VERSION,
        runId: requestId,
        cursor: null,
        page: 0,
      },
      { idempotencyKey: requestId },
    );

    return {
      status: "queued",
      message:
        "Module history analysis queued in small batches. Results remain explicitly separate from owner-confirmed transaction analysis.",
    };
  } catch {
    return {
      status: "error",
      message: "Module history analysis could not be queued right now.",
    };
  }
}
