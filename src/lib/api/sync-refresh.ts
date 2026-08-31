import type { SafeRef, SyncCursor } from "@/core/domain";

export const SYNC_REFRESH_WINDOW_MS = 300_000;
export const SYNC_REFRESH_ACTIVE_WINDOW_SECONDS = 15 * 60;

export const refreshSyncStreams = [
  "multisig",
  "module",
  "transfer",
  "message",
] as const satisfies readonly SyncCursor["stream"][];

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
  status: "queued" | "syncing" | "failed" | "complete",
  latestActivityAt: number | null,
  now = Math.floor(Date.now() / 1_000),
): boolean {
  return (
    (status === "queued" || status === "syncing") &&
    latestActivityAt !== null &&
    latestActivityAt >= now - SYNC_REFRESH_ACTIVE_WINDOW_SECONDS
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

export function refreshIdempotencyKey(safe: SafeRef, now = Date.now()): string {
  const bucket = Math.floor(now / SYNC_REFRESH_WINDOW_MS);
  return `sync:refresh:${safe.chainId}:${safe.address.toLowerCase()}:${bucket}`;
}
