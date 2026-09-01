import { describe, expect, it } from "vitest";

import type {
  Address,
  Hex,
  ModuleTransaction,
} from "../../../../src/core/domain";
import {
  appendUniqueModuleTransactionViews,
  moduleIsEnabled,
  moduleTransactionPageQuerySchema,
  toModuleTransactionView,
} from "../../../../src/lib/api/module-activity";

const transaction: ModuleTransaction = {
  safe: {
    chainId: 50,
    address: "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173",
  },
  module: "0x1111111111111111111111111111111111111111" as Address,
  transactionHash: `0x${"a".repeat(64)}` as Hex,
  to: "0x2222222222222222222222222222222222222222" as Address,
  value: 42n,
  data: "0x1234",
  operation: "delegatecall",
  blockNumber: 123n,
  executedAt: 1_700_000_000,
};

describe("module activity API views", () => {
  it("accepts normalized hash cursors and bounded limits", () => {
    expect(
      moduleTransactionPageQuerySchema.parse({
        cursor: `0x${"A".repeat(64)}`,
        limit: "25",
      }),
    ).toEqual({
      cursor: `0x${"a".repeat(64)}`,
      limit: 25,
    });
    expect(
      moduleTransactionPageQuerySchema.safeParse({
        cursor: "invalid",
        limit: "25",
      }).success,
    ).toBe(false);
    expect(
      moduleTransactionPageQuerySchema.safeParse({
        cursor: null,
        limit: "101",
      }).success,
    ).toBe(false);
  });

  it("serializes bigint fields without weakening execution context", () => {
    expect(toModuleTransactionView(transaction)).toEqual({
      module: transaction.module,
      transactionHash: transaction.transactionHash,
      to: transaction.to,
      value: "42",
      calldataBytes: 2,
      operation: "delegatecall",
      blockNumber: "123",
      executedAt: transaction.executedAt,
    });
  });

  it("matches current module authority case-insensitively", () => {
    expect(
      moduleIsEnabled(transaction.module.toUpperCase(), [transaction.module]),
    ).toBe(true);
    expect(
      moduleIsEnabled(transaction.module, [
        "0x3333333333333333333333333333333333333333",
      ]),
    ).toBe(false);
  });

  it("appends pages without duplicate transaction hashes", () => {
    const first = toModuleTransactionView(transaction);
    const second = {
      ...first,
      transactionHash: `0x${"b".repeat(64)}` as Hex,
    };
    const duplicateWithDifferentCase = {
      ...first,
      transactionHash: first.transactionHash.toUpperCase() as Hex,
    };

    expect(
      appendUniqueModuleTransactionViews(
        [first],
        [duplicateWithDifferentCase, second, second],
      ).map((item) => item.transactionHash),
    ).toEqual([first.transactionHash, second.transactionHash]);
  });
});
