import { describe, expect, it } from "vitest";

import type { Address, Hex, TransferRecord } from "../../../../src/core/domain";
import {
  appendUniqueTransferViews,
  toTransferView,
  transferPageQuerySchema,
} from "../../../../src/lib/api/transfer-activity";

const safeAddress = "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173" as Address;
const other = "0x1111111111111111111111111111111111111111" as Address;

function transfer(from: Address, to: Address): TransferRecord {
  return {
    safe: { chainId: 50, address: safeAddress },
    transactionHash: `0x${"a".repeat(64)}` as Hex,
    token: null,
    from,
    to,
    amount: 42n,
    blockNumber: 123n,
    timestamp: 1_700_000_000,
  };
}

describe("transfer activity API views", () => {
  it("accepts UUID cursors and bounded limits", () => {
    expect(
      transferPageQuerySchema.parse({
        cursor: "123e4567-e89b-12d3-a456-426614174000",
        limit: "25",
      }),
    ).toEqual({
      cursor: "123e4567-e89b-12d3-a456-426614174000",
      limit: 25,
    });
    expect(
      transferPageQuerySchema.safeParse({ cursor: "invalid", limit: "25" })
        .success,
    ).toBe(false);
    expect(
      transferPageQuerySchema.safeParse({ cursor: null, limit: "101" }).success,
    ).toBe(false);
  });

  it("classifies incoming and outgoing movements case-insensitively", () => {
    expect(
      toTransferView(transfer(other, safeAddress.toUpperCase() as Address))
        .direction,
    ).toBe("incoming");
    expect(toTransferView(transfer(safeAddress, other)).direction).toBe(
      "outgoing",
    );
    expect(toTransferView(transfer(safeAddress, safeAddress)).direction).toBe(
      "self",
    );
  });

  it("serializes raw amounts and block numbers without inventing decimals", () => {
    expect(toTransferView(transfer(other, safeAddress))).toEqual({
      transactionHash: `0x${"a".repeat(64)}`,
      token: null,
      from: other,
      to: safeAddress,
      amount: "42",
      blockNumber: "123",
      timestamp: 1_700_000_000,
      direction: "incoming",
      counterparty: other,
    });
  });

  it("deduplicates the persisted transfer identity, not only transaction hash", () => {
    const first = toTransferView(transfer(other, safeAddress));
    const second = {
      ...first,
      token: "0x2222222222222222222222222222222222222222" as Address,
    };
    const duplicateWithDifferentCase = {
      ...first,
      from: first.from.toUpperCase() as Address,
    };

    expect(
      appendUniqueTransferViews(
        [first],
        [duplicateWithDifferentCase, second, second],
      ),
    ).toEqual([first, second]);
  });
});
