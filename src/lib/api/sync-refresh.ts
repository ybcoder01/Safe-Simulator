import type { SafeRef } from "@/core/domain";

export const SYNC_REFRESH_WINDOW_MS = 300_000;

export type RefreshSyncState =
  | { readonly status: "idle"; readonly message: null; readonly requestedAt: null }
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

export function refreshIdempotencyKey(
  safe: SafeRef,
  now = Date.now(),
): string {
  const bucket = Math.floor(now / SYNC_REFRESH_WINDOW_MS);
  return `sync:refresh:${safe.chainId}:${safe.address.toLowerCase()}:${bucket}`;
}
