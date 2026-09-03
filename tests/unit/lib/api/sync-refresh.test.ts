import { describe, expect, it } from "vitest";

import type {
  QueueJob,
  SafeRef,
  SyncCursor,
} from "../../../../src/core/domain";
import {
  hasRefreshRequestSettled,
  isRefreshActive,
  isSafeBookmarked,
  queuedRefreshCursors,
  queueSafeRefresh,
  refreshIdempotencyKey,
  refreshSyncStreams,
  restoredRefreshCursors,
  SYNC_REFRESH_ACTIVE_WINDOW_SECONDS,
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

  it("allows retrying an abandoned queued or running refresh", () => {
    const now = 10_000;
    expect(isRefreshActive("queued", now, now)).toBe(true);
    expect(
      isRefreshActive("syncing", now - SYNC_REFRESH_ACTIVE_WINDOW_SECONDS, now),
    ).toBe(true);
    expect(
      isRefreshActive(
        "queued",
        now - SYNC_REFRESH_ACTIVE_WINDOW_SECONDS - 1,
        now,
      ),
    ).toBe(false);
    expect(isRefreshActive("queued", null, now)).toBe(false);
    expect(isRefreshActive("complete", now, now)).toBe(false);
    expect(isRefreshActive("failed", now, now)).toBe(false);
  });

  it("settles only after persisted terminal activity reaches the request", () => {
    const requestedAt = 10_500;

    expect(
      hasRefreshRequestSettled("queued", requestedAt, 10, "complete"),
    ).toBe(true);
    expect(hasRefreshRequestSettled("running", requestedAt, 11, "failed")).toBe(
      true,
    );
    expect(
      hasRefreshRequestSettled("queued", requestedAt, null, "complete"),
    ).toBe(false);
    expect(hasRefreshRequestSettled("queued", requestedAt, 9, "complete")).toBe(
      false,
    );
    expect(hasRefreshRequestSettled("queued", requestedAt, 10, "syncing")).toBe(
      false,
    );
    expect(hasRefreshRequestSettled("error", requestedAt, 10, "failed")).toBe(
      false,
    );
  });

  it("keeps retries stable while allowing a later completed refresh", () => {
    const firstRequestAt = 3_000_001;
    const secondRequestAt = firstRequestAt + 10_000;

    expect(refreshIdempotencyKey(safe, firstRequestAt)).toBe(
      refreshIdempotencyKey(safe, firstRequestAt),
    );
    expect(refreshIdempotencyKey(safe, firstRequestAt)).not.toBe(
      refreshIdempotencyKey(safe, secondRequestAt),
    );
    expect(refreshIdempotencyKey(safe, firstRequestAt)).toContain(
      safe.address.toLowerCase(),
    );
  });

  it("queues one four-stream refresh and joins a duplicate request", async () => {
    const cursors = new Map<SyncCursor["stream"], SyncCursor>(
      refreshSyncStreams.map((stream) => [
        stream,
        {
          safe,
          stream,
          cursor: `${stream}-cursor`,
          status: "complete",
          updatedAt: 10,
        },
      ]),
    );
    const jobs: QueueJob[] = [];
    const persistence = {
      findSyncCursor: async (
        _safe: SafeRef,
        stream: SyncCursor["stream"],
      ) => cursors.get(stream) ?? null,
      saveSyncCursor: async (cursor: SyncCursor) => {
        cursors.set(cursor.stream, cursor);
      },
    };
    const queue = {
      enqueue: async (
        job: QueueJob,
        _options: { idempotencyKey: string; delaySeconds?: number },
      ) => {
        jobs.push(job);
        return { jobId: "queued" };
      },
    };

    await expect(
      queueSafeRefresh(persistence, queue, safe, 20_000),
    ).resolves.toEqual({ status: "queued", requestedAt: 20_000 });
    await expect(
      queueSafeRefresh(persistence, queue, safe, 20_500),
    ).resolves.toEqual({ status: "running", requestedAt: 20_500 });

    expect(jobs).toEqual([
      {
        type: "incremental-sync",
        safe,
        runId: refreshIdempotencyKey(safe, 20_000),
      },
    ]);
    expect([...cursors.values()]).toEqual(
      refreshSyncStreams.map((stream) => ({
        safe,
        stream,
        cursor: `${stream}-cursor`,
        status: "idle",
        updatedAt: 20,
      })),
    );
  });

  it("restores all cursor boundaries when queue publication fails", async () => {
    const original = refreshSyncStreams.map((stream) => ({
      safe,
      stream,
      cursor: `${stream}-cursor`,
      status: "complete" as const,
      updatedAt: 10,
    }));
    const cursors = new Map(
      original.map((cursor) => [cursor.stream, cursor]),
    );
    const persistence = {
      findSyncCursor: async (
        _safe: SafeRef,
        stream: SyncCursor["stream"],
      ) => cursors.get(stream) ?? null,
      saveSyncCursor: async (cursor: SyncCursor) => {
        cursors.set(cursor.stream, cursor);
      },
    };
    const queue = {
      enqueue: async (
        _job: QueueJob,
        _options: { idempotencyKey: string; delaySeconds?: number },
      ) => {
        throw new Error("queue unavailable");
      },
    };

    await expect(
      queueSafeRefresh(persistence, queue, safe, 20_000),
    ).rejects.toThrow("queue unavailable");
    expect([...cursors.values()]).toEqual(original);
  });
});
