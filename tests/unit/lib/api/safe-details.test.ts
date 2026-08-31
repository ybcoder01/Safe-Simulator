import { describe, expect, it, vi } from "vitest";

import type {
  SafeRef,
  SafeTransaction,
  SyncCursor,
  TokenBalance,
} from "../../../../src/core/domain";
import {
  groupTransactionViews,
  safeRouteParamsSchema,
  summarizeSyncCursors,
  toBalanceView,
  toTransactionView,
  transactionMatchesSearch,
  transactionPageQuerySchema,
} from "../../../../src/lib/api/safe-details";

const safeRef: SafeRef = {
  chainId: 50,
  address: "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173",
};

function syncCursor(
  stream: SyncCursor["stream"],
  status: SyncCursor["status"],
  updatedAt: number,
): SyncCursor {
  return {
    safe: safeRef,
    stream,
    cursor: null,
    status,
    updatedAt,
  };
}

describe("Safe dashboard API view models", () => {
  it("parses supported Safe routes and normalizes the address", () => {
    const parsed = safeRouteParamsSchema.parse({
      chainId: "50",
      address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
    });

    expect(parsed.chainId).toBe(50);
    expect(parsed.address).toBe("0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173");
  });

  it("rejects unsupported chains and unsafe pagination limits", () => {
    expect(
      safeRouteParamsSchema.safeParse({
        chainId: "137",
        address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
      }).success,
    ).toBe(false);
    expect(
      transactionPageQuerySchema.safeParse({
        cursor: null,
        limit: "500",
      }).success,
    ).toBe(false);
  });

  it("serializes bigint transaction fields for JSON responses", () => {
    const transaction = {
      safe: {
        chainId: 50,
        address: "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173",
      },
      safeTxHash: `0x${"1".repeat(64)}`,
      nonce: 2n,
      to: "0x1111111111111111111111111111111111111111",
      value: 42n,
      data: "0x",
      operation: "call",
      status: "executed",
      confirmations: [],
      proposedAt: 1_700_000_000,
      executedAt: 1_700_000_100,
      executedTxHash: `0x${"2".repeat(64)}`,
      blockNumber: 12n,
      blockHash: `0x${"3".repeat(64)}`,
    } as SafeTransaction;

    expect(toTransactionView(transaction)).toMatchObject({
      nonce: "2",
      value: "42",
      blockNumber: "12",
    });
  });

  it("separates pending actions from historical activity without reordering", () => {
    const makeTransaction = (
      status: SafeTransaction["status"],
      suffix: string,
    ) =>
      toTransactionView({
        safe: {
          chainId: 50,
          address: "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173",
        },
        safeTxHash: `0x${suffix.repeat(64)}`,
        nonce: BigInt(suffix),
        to: "0x1111111111111111111111111111111111111111",
        value: 0n,
        data: "0x",
        operation: "call",
        status,
        confirmations: [],
        proposedAt: 1_700_000_000 + Number(suffix),
        executedAt: status === "executed" ? 1_700_000_100 : null,
        executedTxHash: null,
        blockNumber: null,
        blockHash: null,
      } as SafeTransaction);

    const executed = makeTransaction("executed", "1");
    const pending = makeTransaction("pending", "2");
    const replaced = makeTransaction("replaced", "3");

    expect(groupTransactionViews([executed, pending, replaced])).toEqual({
      pending: [pending],
      history: [executed, replaced],
    });
  });

  it("searches loaded transactions by address, metadata, and resolved label", () => {
    const transaction = toTransactionView({
      safe: safeRef,
      safeTxHash: `0x${"a".repeat(64)}`,
      nonce: 42n,
      to: "0x1111111111111111111111111111111111111111",
      value: 0n,
      data: "0x",
      operation: "delegatecall",
      status: "executed",
      confirmations: [],
      proposedAt: 1_700_000_000,
      executedAt: 1_700_000_100,
      executedTxHash: `0x${"b".repeat(64)}`,
      blockNumber: 12n,
      blockHash: `0x${"c".repeat(64)}`,
    } as SafeTransaction);

    expect(transactionMatchesSearch(transaction, "treasury", "Treasury Router")).toBe(
      true,
    );
    expect(transactionMatchesSearch(transaction, "0x111111")).toBe(true);
    expect(transactionMatchesSearch(transaction, "42")).toBe(true);
    expect(transactionMatchesSearch(transaction, "delegate")).toBe(true);
    expect(transactionMatchesSearch(transaction, "no match")).toBe(false);
    expect(transactionMatchesSearch(transaction, "   ")).toBe(true);
  });

  it("uses the oldest completed stream as the conservative full-sync time", () => {
    expect(
      summarizeSyncCursors([
        syncCursor("multisig", "complete", 240),
        syncCursor("module", "complete", 220),
        syncCursor("transfer", "complete", 230),
        syncCursor("message", "complete", 210),
      ]),
    ).toEqual({
      status: "complete",
      completedStreams: 4,
      totalStreams: 4,
      lastFullSyncAt: 210,
      latestActivityAt: 240,
    });
  });

  it("keeps full-sync time unknown for partial and failed cursor sets", () => {
    expect(
      summarizeSyncCursors([
        syncCursor("multisig", "complete", 200),
        syncCursor("module", "running", 250),
        null,
        null,
      ]),
    ).toEqual({
      status: "syncing",
      completedStreams: 1,
      totalStreams: 4,
      lastFullSyncAt: null,
      latestActivityAt: 250,
    });

    expect(
      summarizeSyncCursors([
        syncCursor("multisig", "running", 260),
        syncCursor("module", "failed", 270),
        syncCursor("transfer", "complete", 200),
        syncCursor("message", "complete", 210),
      ]).status,
    ).toBe("failed");
  });

  it("serializes token amounts without losing precision", () => {
    const balance = {
      token: null,
      amount: 12345678901234567890n,
      decimals: 18,
      symbol: "XDC",
    } as TokenBalance;

    expect(toBalanceView(balance).amount).toBe("12345678901234567890");
    expect(vi.isMockFunction(toBalanceView)).toBe(false);
  });
});
