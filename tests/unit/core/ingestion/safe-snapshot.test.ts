import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  SafeRef,
  SafeSnapshot,
} from "../../../../src/core/domain";
import {
  assertValidSafeSnapshot,
  refreshSafeSnapshot,
} from "../../../../src/core/ingestion/safe-snapshot";

const safe: SafeRef = {
  chainId: 50,
  address: "0x1111111111111111111111111111111111111111" as Address,
};

const snapshot: SafeSnapshot = {
  ...safe,
  owners: [
    "0x2222222222222222222222222222222222222222" as Address,
    "0x3333333333333333333333333333333333333333" as Address,
    "0x4444444444444444444444444444444444444444" as Address,
  ],
  threshold: 2,
  nonce: 9n,
  version: "1.4.1",
  guard: null,
  modules: [],
  implementation: null,
  observedAt: 300,
};

describe("refreshSafeSnapshot", () => {
  it("persists the latest canonical Safe configuration", async () => {
    const getSafeSnapshot = vi.fn().mockResolvedValue(snapshot);
    const upsertSafe = vi.fn().mockResolvedValue(undefined);

    await expect(
      refreshSafeSnapshot(safe, {
        chain: { getSafeSnapshot },
        persistence: { upsertSafe },
      }),
    ).resolves.toEqual(snapshot);

    expect(getSafeSnapshot).toHaveBeenCalledWith(safe);
    expect(upsertSafe).toHaveBeenCalledWith(snapshot);
  });

  it("rejects an impossible threshold before persistence", async () => {
    const invalid = { ...snapshot, threshold: 4 };
    const upsertSafe = vi.fn().mockResolvedValue(undefined);

    expect(() => assertValidSafeSnapshot(invalid)).toThrow(
      "invalid Safe configuration",
    );
    await expect(
      refreshSafeSnapshot(safe, {
        chain: { getSafeSnapshot: vi.fn().mockResolvedValue(invalid) },
        persistence: { upsertSafe },
      }),
    ).rejects.toThrow("invalid Safe configuration");
    expect(upsertSafe).not.toHaveBeenCalled();
  });
});
