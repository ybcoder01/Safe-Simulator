import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  QueueJob,
  SafeSnapshot,
} from "../../../../src/core/domain";
import {
  SAFE_SYNC_STREAM_COUNT,
  SAFE_SYNC_STREAM_DELAY_SECONDS,
} from "../../../../src/core/ingestion/backfill";
import { runSyncSweep } from "../../../../src/core/ingestion/sweep";

const snapshot = (address: Address): SafeSnapshot => ({
  chainId: 1,
  address,
  owners: ["0x9999999999999999999999999999999999999999" as Address],
  threshold: 1,
  nonce: 0n,
  version: "1.4.1",
  guard: null,
  modules: [],
  implementation: null,
  observedAt: 1_782_000_000,
});

describe("runSyncSweep", () => {
  it("schedules every stream and continues the bounded sweep", async () => {
    const persistence = {
      listSafes: vi.fn().mockResolvedValue({
        items: [
          snapshot("0x1111111111111111111111111111111111111111" as Address),
          snapshot("0x2222222222222222222222222222222222222222" as Address),
        ],
        nextCursor: "next-page",
        total: null,
      }),
    };
    const queue = {
      enqueue: vi.fn().mockImplementation(async (job: QueueJob) => {
        JSON.stringify(job);
        return { jobId: "job_test" };
      }),
    };

    await expect(
      runSyncSweep(
        { type: "sync-sweep", cursor: null },
        { persistence, queue, now: () => 1_782_000_000 },
      ),
    ).resolves.toEqual({ scheduled: 2, nextCursor: "next-page" });

    expect(queue.enqueue).toHaveBeenCalledTimes(9);
    for (let index = 0; index < 8; index += 1) {
      expect(queue.enqueue).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({ type: "backfill" }),
        expect.objectContaining({
          delaySeconds: index * SAFE_SYNC_STREAM_DELAY_SECONDS,
        }),
      );
    }
    expect(queue.enqueue).toHaveBeenNthCalledWith(
      9,
      { type: "sync-sweep", cursor: "next-page" },
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("next-page"),
        delaySeconds:
          2 * SAFE_SYNC_STREAM_COUNT * SAFE_SYNC_STREAM_DELAY_SECONDS,
      }),
    );
  });
});
