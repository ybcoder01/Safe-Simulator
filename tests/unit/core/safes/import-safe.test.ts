import { describe, expect, it, vi } from "vitest";

import type { Address, SafeSnapshot } from "../../../../src/core/domain";
import type { ChainPort } from "../../../../src/core/ports";
import { ImportSafeService } from "../../../../src/core/safes/import-safe";

const safeAddress = "0x1111111111111111111111111111111111111111" as Address;
const ownerAddress = "0x2222222222222222222222222222222222222222" as Address;

const snapshot: SafeSnapshot = {
  chainId: 1,
  address: safeAddress,
  owners: [ownerAddress],
  threshold: 1,
  nonce: 4n,
  version: "1.4.1",
  guard: null,
  modules: [],
  implementation: "0x3333333333333333333333333333333333333333",
  observedAt: 1_782_000_000,
};

function makeChain(overrides: Partial<ChainPort> = {}): ChainPort {
  return {
    getCode: vi.fn().mockResolvedValue("0x6000"),
    getSafeSnapshot: vi.fn().mockResolvedValue(snapshot),
    call: vi.fn(),
    getBlockHash: vi.fn(),
    getTransactionBlock: vi.fn(),
    ...overrides,
  };
}

function makePersistence() {
  return {
    upsertSafe: vi.fn().mockResolvedValue(undefined),
    bookmarkSafe: vi.fn().mockResolvedValue(undefined),
  };
}

function makeQueue() {
  return {
    enqueue: vi.fn().mockResolvedValue({ jobId: "job_test" }),
  };
}

describe("ImportSafeService", () => {
  it("rejects an EOA before attempting Safe reads", async () => {
    const chain = makeChain({ getCode: vi.fn().mockResolvedValue("0x") });
    const persistence = makePersistence();
    const service = new ImportSafeService(chain, persistence, makeQueue());

    await expect(
      service.execute({
        chainId: 1,
        address: safeAddress,
        profileId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "not_contract" });
    expect(chain.getSafeSnapshot).not.toHaveBeenCalled();
    expect(persistence.upsertSafe).not.toHaveBeenCalled();
  });

  it("rejects contracts that do not implement the Safe read surface", async () => {
    const chain = makeChain({
      getSafeSnapshot: vi
        .fn()
        .mockRejectedValue(new Error("execution reverted")),
    });
    const service = new ImportSafeService(
      chain,
      makePersistence(),
      makeQueue(),
    );

    await expect(
      service.execute({
        chainId: 1,
        address: safeAddress,
        profileId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "not_safe" });
  });

  it("persists and bookmarks a verified Safe", async () => {
    const persistence = makePersistence();
    const queue = makeQueue();
    const service = new ImportSafeService(makeChain(), persistence, queue);
    const profileId = crypto.randomUUID();

    await expect(
      service.execute({ chainId: 1, address: safeAddress, profileId }),
    ).resolves.toEqual(snapshot);
    expect(persistence.upsertSafe).toHaveBeenCalledWith(snapshot);
    expect(persistence.bookmarkSafe).toHaveBeenCalledWith(profileId, {
      chainId: 1,
      address: safeAddress,
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(4);
  });

  it("rejects impossible owner thresholds", async () => {
    const invalid = { ...snapshot, threshold: 2 };
    const service = new ImportSafeService(
      makeChain({ getSafeSnapshot: vi.fn().mockResolvedValue(invalid) }),
      makePersistence(),
      makeQueue(),
    );

    await expect(
      service.execute({
        chainId: 1,
        address: safeAddress,
        profileId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: "invalid_safe_configuration",
    });
  });
});
