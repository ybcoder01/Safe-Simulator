import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  ContractMetadata,
  Hex,
} from "../../../../src/core/domain";
import { resolveStorageChangeAnalysis } from "../../../../src/lib/api/storage-changes";

const slot =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const before =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;
const after =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;

function address(index: number): Address {
  return `0x${index.toString(16).padStart(40, "0")}` as Address;
}

function metadata(target: Address): ContractMetadata {
  return {
    address: target,
    chainId: 50,
    label: "Vault",
    verified: true,
    abi: [],
    implementation: null,
    storageLayout: {
      slots: [
        {
          slot,
          label: "owner",
          type: "address",
          offset: 0,
          numberOfBytes: 32,
          encoding: "inplace",
        },
      ],
    },
    source: "sourcify",
  };
}

describe("resolveStorageChangeAnalysis", () => {
  it("bounds metadata lookups and leaves later contracts raw", async () => {
    const getContractMetadata = vi.fn(
      async (_chainId: number, target: Address) =>
      metadata(target),
    );
    const storageChanges = Array.from({ length: 21 }, (_, index) => ({
      address: address(index + 1),
      slot,
      before,
      after,
    }));

    const result = await resolveStorageChangeAnalysis(
      { getContractMetadata },
      50,
      { storageChanges },
    );

    expect(getContractMetadata).toHaveBeenCalledTimes(20);
    expect(result.namedCount).toBe(20);
    expect(result.rawCount).toBe(1);
    expect(result.lookupLimited).toBe(true);
    expect(result.warnings).toHaveLength(2);
    expect(result.items[20]).toMatchObject({ status: "raw" });
  });

  it("preserves raw changes when metadata lookup fails", async () => {
    const result = await resolveStorageChangeAnalysis(
      {
        getContractMetadata: vi.fn().mockRejectedValue(new Error("offline")),
      },
      50,
      {
        storageChanges: [{ address: address(1), slot, before, after }],
      },
    );

    expect(result).toMatchObject({
      namedCount: 0,
      rawCount: 1,
      verifiedLayoutCount: 0,
    });
    expect(result.items[0]).toMatchObject({ before, after, status: "raw" });
  });
});
