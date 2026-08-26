import { describe, expect, it, vi } from "vitest";

import type { Address, SafeSnapshot } from "../../../../src/core/domain";
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
      enqueue: vi.fn().mockResolvedValue({ jobId: "job_test" }),
    };

    await expect(
      runSyncSweep(
        { type: "sync-sweep", cursor: null },
        { persistence, queue, now: () => 1_782_000_000 },
      ),
    ).resolves.toEqual({ scheduled: 2, nextCursor: "next-page" });

    expect(queue.enqueue).toHaveBeenCalledTimes(9);
    expect(queue.enqueue).toHaveBeenCalledWith(
      { type: "sync-sweep", cursor: "next-page" },
      expect.objectContaining({
        idempotencyKey: expect.stringContaining("next-page"),
      }),
    );
  });
});
