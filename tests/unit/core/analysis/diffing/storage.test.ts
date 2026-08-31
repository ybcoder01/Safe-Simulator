import { describe, expect, it } from "vitest";

import { interpretStorageChanges } from "../../../../../src/core/analysis/diffing/storage";
import type {
  Address,
  ContractMetadata,
  Hex,
  StorageChange,
} from "../../../../../src/core/domain";

const address = "0x1111111111111111111111111111111111111111" as Address;
const slot = "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const change: StorageChange = {
  address,
  slot,
  before: "0x0000000000000000000000000000000000000000000000000000000000000000",
  after: "0x0000000000000000000000000000000000000000000000000000000000000001",
};

function metadata(
  slots: NonNullable<ContractMetadata["storageLayout"]>["slots"],
): ContractMetadata {
  return {
    address,
    chainId: 50,
    label: "Vault",
    verified: true,
    abi: [],
    implementation: null,
    storageLayout: { slots },
    source: "sourcify",
  };
}

describe("interpretStorageChanges", () => {
  it("names a single exact full-width variable from verified metadata", () => {
    const [result] = interpretStorageChanges(
      [change],
      [
        metadata([
          {
            slot,
            label: "owner",
            type: "address",
            offset: 0,
            numberOfBytes: 32,
            encoding: "inplace",
          },
        ]),
      ],
    );

    expect(result).toMatchObject({
      status: "named",
      label: "owner",
      type: "address",
      contractLabel: "Vault",
      metadataSource: "sourcify",
      before: change.before,
      after: change.after,
    });
  });

  it("keeps packed or ambiguous variables raw", () => {
    const result = interpretStorageChanges(
      [change],
      [
        metadata([
          {
            slot,
            label: "enabled",
            type: "bool",
            offset: 0,
            numberOfBytes: 1,
            encoding: "inplace",
          },
          {
            slot,
            label: "counter",
            type: "uint248",
            offset: 1,
            numberOfBytes: 31,
            encoding: "inplace",
          },
        ]),
      ],
    )[0];

    expect(result).toMatchObject({
      status: "raw",
      label: null,
      type: null,
      before: change.before,
      after: change.after,
    });
  });

  it("does not name mapping or unverified layout entries", () => {
    const mapping = metadata([
      {
        slot,
        label: "balances",
        type: "mapping(address => uint256)",
        offset: 0,
        numberOfBytes: 32,
        encoding: "mapping",
      },
    ]);
    const unverified = { ...mapping, verified: false };

    expect(interpretStorageChanges([change], [mapping])[0]?.status).toBe("raw");
    expect(interpretStorageChanges([change], [unverified])[0]?.status).toBe(
      "raw",
    );
  });
});
