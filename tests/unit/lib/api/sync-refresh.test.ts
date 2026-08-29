import { describe, expect, it } from "vitest";

import type { SafeRef, SyncCursor } from "../../../../src/core/domain";
import {
  isSafeBookmarked,
  queuedRefreshCursors,
  refreshIdempotencyKey,
  refreshSyncStreams,
  restoredRefreshCursors,
  SYNC_REFRESH_WINDOW_MS,
} from "../../../../src/lib/api/sync-refresh";

const safe: SafeRef = {
  chainId: 50,
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
};

describe("on-demand synchronization refresh", () => {
  it("authorizes only an exact chain and case-insensitive address bookmark", () => {
    expect(
      isSafeBookmarked(
        [
          {
            chainId: 50,
            address: "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173",
          },
        ],
        safe,
      ),
    ).toBe(true);
    expect(isSafeBookmarked([{ ...safe, chainId: 1 }], safe)).toBe(false);
    expect(
      isSafeBookmarked(
        [
          {
            chainId: 50,
            address: "0x1111111111111111111111111111111111111111",
          },
        ],
        safe,
      ),
    ).toBe(false);
  });

  it("records every stream as queued without discarding its cursor", () => {
    const current: readonly (SyncCursor | null)[] = refreshSyncStreams.map(
      (stream, index) =>
        index === 0
          ? {
              safe,
              stream,
              cursor: "next-page",
              status: "complete",
              updatedAt: 10,
            }
          : null,
    );

    expect(queuedRefreshCursors(safe, current, 20)).toEqual(
      refreshSyncStreams.map((stream, index) => ({
        safe,
        stream,
        cursor: index === 0 ? "next-page" : null,
        status: "idle",
        updatedAt: 20,
      })),
    );
  });

  it("restores existing cursors and marks missing streams failed after rejection", () => {
    const existing: SyncCursor = {
      safe,
      stream: "multisig",
      cursor: "next-page",
      status: "complete",
      updatedAt: 10,
    };
    const restored = restoredRefreshCursors(
      safe,
      [existing, null, null, null],
      20,
    );

    expect(restored[0]).toBe(existing);
    expect(restored.slice(1)).toEqual(
      refreshSyncStreams.slice(1).map((stream) => ({
        safe,
        stream,
        cursor: null,
        status: "failed",
        updatedAt: 20,
      })),
    );
  });

  it("deduplicates refreshes in one five-minute bucket", () => {
    const start = SYNC_REFRESH_WINDOW_MS * 10 + 1;
    expect(refreshIdempotencyKey(safe, start)).toBe(
      refreshIdempotencyKey(safe, start + SYNC_REFRESH_WINDOW_MS - 2),
    );
    expect(refreshIdempotencyKey(safe, start)).not.toBe(
      refreshIdempotencyKey(safe, start + SYNC_REFRESH_WINDOW_MS),
    );
    expect(refreshIdempotencyKey(safe, start)).toContain(
      safe.address.toLowerCase(),
    );
  });
});
