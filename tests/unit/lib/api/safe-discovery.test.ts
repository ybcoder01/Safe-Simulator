import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  SafeRef,
  SafeSnapshot,
} from "../../../../src/core/domain";
import { resolveSafeDiscovery } from "../../../../src/lib/api/safe-discovery";

function address(index: number): Address {
  return `0x${index.toString(16).padStart(40, "0")}` as Address;
}

function snapshot(index: number): SafeSnapshot {
  return {
    chainId: 50,
    address: address(index),
    owners: [address(999)],
    threshold: 1,
    nonce: 0n,
    version: "1.4.1",
    guard: null,
    modules: [],
    implementation: null,
    observedAt: 1,
  };
}

describe("resolveSafeDiscovery", () => {
  it("deduplicates, marks imported Safes, and bounds the response", async () => {
    const discovered: SafeRef[] = [
      ...Array.from({ length: 101 }, (_, index) => ({
        chainId: 50,
        address: address(index + 1),
      })),
      { chainId: 50, address: address(1) },
      { chainId: 1, address: address(500) },
    ];
    const discoverSafesByOwner = vi.fn().mockResolvedValue(discovered);
    const listSafesForProfile = vi.fn().mockResolvedValue([snapshot(2)]);

    const result = await resolveSafeDiscovery(
      { discoverSafesByOwner },
      { listSafesForProfile },
      { chainId: 50, owner: address(999) },
      "profile-1",
    );

    expect(discoverSafesByOwner).toHaveBeenCalledWith(50, address(999));
    expect(listSafesForProfile).toHaveBeenCalledWith("profile-1");
    expect(result).toMatchObject({ total: 101, limited: true });
    expect(result.items).toHaveLength(100);
    expect(result.items[1]).toMatchObject({
      address: address(2),
      imported: true,
    });
  });

  it("does not read profile bookmarks without a valid profile", async () => {
    const listSafesForProfile = vi.fn();

    const result = await resolveSafeDiscovery(
      {
        discoverSafesByOwner: vi.fn().mockResolvedValue([
          { chainId: 1, address: address(1) },
        ]),
      },
      { listSafesForProfile },
      { chainId: 1, owner: address(999) },
      null,
    );

    expect(listSafesForProfile).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({ imported: false });
  });
});
