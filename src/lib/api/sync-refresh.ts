import type { SafeRef, SyncCursor } from "@/core/domain";
import type { PersistencePort, QueuePort } from "@/core/ports";
import { summarizeSyncCursors } from "@/lib/api/safe-details";

export const SYNC_REFRESH_ACTIVE_WINDOW_SECONDS = 15 * 60;

export const refreshSyncStreams = [
  "multisig",
  "module",
  "transfer",
  "message",
] as const satisfies readonly SyncCursor["stream"][];

export type SyncRefreshStatus = "queued" | "syncing" | "failed" | "complete";

export type RefreshSyncState =
  | {
      readonly status: "idle";
      readonly message: null;
      readonly requestedAt: null;
    }
  | {
      readonly status: "queued" | "running" | "error";
      readonly message: string;
      readonly requestedAt: number;
    };

export const initialRefreshSyncState: RefreshSyncState = {
  status: "idle",
  message: null,
  requestedAt: null,
};

export type RefreshSyncAction = (
  previousState: RefreshSyncState,
  formData: FormData,
) => Promise<RefreshSyncState>;

export function isRefreshActive(
  status: SyncRefreshStatus,
  latestActivityAt: number | null,
  now = Math.floor(Date.now() / 1_000),
): boolean {
  return (
    (status === "queued" || status === "syncing") &&
    latestActivityAt !== null &&
    latestActivityAt >= now - SYNC_REFRESH_ACTIVE_WINDOW_SECONDS
  );
}

export function hasRefreshRequestSettled(
  actionStatus: RefreshSyncState["status"],
  requestedAt: number | null,
  latestActivityAt: number | null,
  syncStatus: SyncRefreshStatus,
): boolean {
  return (
    (actionStatus === "queued" || actionStatus === "running") &&
    requestedAt !== null &&
    latestActivityAt !== null &&
    latestActivityAt >= Math.floor(requestedAt / 1_000) &&
    (syncStatus === "complete" || syncStatus === "failed")
  );
}

export function isSafeBookmarked(
  safes: readonly SafeRef[],
  target: SafeRef,
): boolean {
  return safes.some(
    (safe) =>
      safe.chainId === target.chainId &&
      safe.address.toLowerCase() === target.address.toLowerCase(),
  );
}

export function queuedRefreshCursors(
  safe: SafeRef,
  current: readonly (SyncCursor | null)[],
  now: number,
): readonly SyncCursor[] {
  return refreshSyncStreams.map((stream, index) => ({
    safe,
    stream,
    cursor: current[index]?.cursor ?? null,
    status: "idle",
    updatedAt: now,
  }));
}

export function restoredRefreshCursors(
  safe: SafeRef,
  current: readonly (SyncCursor | null)[],
  now: number,
): readonly SyncCursor[] {
  return refreshSyncStreams.map(
    (stream, index) =>
      current[index] ?? {
        safe,
        stream,
        cursor: null,
        status: "failed",
        updatedAt: now,
      },
  );
}

export function refreshIdempotencyKey(
  safe: SafeRef,
  requestedAt = Date.now(),
): string {
  return `sync:refresh:${safe.chainId}:${safe.address.toLowerCase()}:${requestedAt}`;
}

type RefreshPersistence = Pick<
  PersistencePort,
  "findSyncCursor" | "saveSyncCursor"
>;
type RefreshQueue = Pick<QueuePort, "enqueue">;

export interface QueuedSafeRefresh {
  readonly status: "queued" | "running";
  readonly requestedAt: number;
}

export async function queueSafeRefresh(
  persistence: RefreshPersistence,
  queue: RefreshQueue,
  safe: SafeRef,
  requestedAt = Date.now(),
): Promise<QueuedSafeRefresh> {
  const currentCursors = await Promise.all(
    refreshSyncStreams.map((stream) =>
      persistence.findSyncCursor(safe, stream),
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
    return { status: "running", requestedAt };
  }

  const requestedAtSeconds = Math.floor(requestedAt / 1_000);
  const queuedCursors = queuedRefreshCursors(
    safe,
    currentCursors,
    requestedAtSeconds,
  );

  try {
    await Promise.all(
      queuedCursors.map((cursor) => persistence.saveSyncCursor(cursor)),
    );
    const requestId = refreshIdempotencyKey(safe, requestedAt);
    await queue.enqueue(
      { type: "incremental-sync", safe, runId: requestId },
      { idempotencyKey: requestId },
    );
  } catch (error) {
    const restoredCursors = restoredRefreshCursors(
      safe,
      currentCursors,
      requestedAtSeconds,
    );
    await Promise.allSettled(
      restoredCursors.map((cursor) => persistence.saveSyncCursor(cursor)),
    );
    throw error;
  }

  return { status: "queued", requestedAt };
}
