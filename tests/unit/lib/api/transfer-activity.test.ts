import { describe, expect, it } from "vitest";

import type { Address, Hex, TransferRecord } from "../../../../src/core/domain";
import {
  appendUniqueTransferViews,
  resolveTransferAmount,
  toTransferView,
  transferPageQuerySchema,
} from "../../../../src/lib/api/transfer-activity";

const safeAddress = "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173" as Address;
const other = "0x1111111111111111111111111111111111111111" as Address;
const reviewedUsdc = "0xfa2958cb79b0491cc627c1557f441ef849ca8eb1" as Address;
const unknownToken = "0x2222222222222222222222222222222222222222" as Address;

function transfer(
  from: Address,
  to: Address,
  options: {
    readonly amount?: bigint;
    readonly token?: Address | null;
  } = {},
): TransferRecord {
  return {
    safe: { chainId: 50, address: safeAddress },
    transactionHash: ("0x" + "a".repeat(64)) as Hex,
    token: options.token ?? null,
    from,
    to,
    amount: options.amount ?? 42n,
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

  it("formats native movements with the chain symbol", () => {
    expect(resolveTransferAmount(transfer(other, safeAddress))).toEqual({
      displayAmount: "0.000000000000000042",
      symbol: "XDC",
      amountSource: "native",
      metadataStatus: null,
      metadataWarning: null,
    });
  });

  it("formats reviewed tokens with trusted decimals and symbols", () => {
    expect(
      resolveTransferAmount(
        transfer(other, safeAddress, {
          amount: 1_500_000n,
          token: reviewedUsdc,
        }),
      ),
    ).toEqual({
      displayAmount: "1.5",
      symbol: "USDC",
      amountSource: "reviewed",
      metadataStatus: null,
      metadataWarning: null,
    });
  });

  it("formats unreviewed tokens with clearly sourced on-chain metadata", () => {
    expect(
      resolveTransferAmount(
        transfer(other, safeAddress, {
          amount: 1_500_000n,
          token: unknownToken,
        }),
        {
          token: unknownToken,
          status: "resolved",
          symbol: "TKN",
          decimals: 6,
          warning: null,
        },
      ),
    ).toEqual({
      displayAmount: "1.5",
      symbol: "TKN",
      amountSource: "on-chain",
      metadataStatus: "resolved",
      metadataWarning: null,
    });
  });

  it("keeps unknown token amounts explicitly in raw units", () => {
    expect(
      resolveTransferAmount(
        transfer(other, safeAddress, {
          amount: 1_500_000n,
          token: unknownToken,
        }),
      ),
    ).toEqual({
      displayAmount: "1500000",
      symbol: null,
      amountSource: "raw",
      metadataStatus: null,
      metadataWarning: null,
    });
  });

  it("serializes amounts and block numbers without losing raw evidence", () => {
    expect(toTransferView(transfer(other, safeAddress))).toEqual({
      transactionHash: ("0x" + "a".repeat(64)) as Hex,
      token: null,
      from: other,
      to: safeAddress,
      amount: "42",
      displayAmount: "0.000000000000000042",
      symbol: "XDC",
      amountSource: "native",
      metadataStatus: null,
      metadataWarning: null,
      blockNumber: "123",
      timestamp: 1_700_000_000,
      direction: "incoming",
      counterparty: other,
    });
  });

  it("deduplicates the persisted transfer identity, not only transaction hash", () => {
    const first = toTransferView(transfer(other, safeAddress));
    const second = toTransferView(
      transfer(other, safeAddress, { token: unknownToken }),
    );
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
