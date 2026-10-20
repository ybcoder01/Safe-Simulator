import { describe, expect, it } from "vitest";

import {
  nativeReceivedBy,
  successfulNativeTransfers,
} from "@/core/analysis/tokens/native-transfers";

const safe = "0xdb9faced3efde6f6b17296644adfafb28e4e2d23";
const router = "0x24a084df10d4cb5d6c1a7c6c6e8d2d4a60f2a5aa";
const other = "0x7777777777777777777777777777777777777777";

function call(
  overrides: Partial<Parameters<typeof successfulNativeTransfers>[0][number]>,
) {
  return {
    depth: 1,
    from: safe,
    to: router,
    value: "0",
    operation: "call" as const,
    reverted: false,
    ...overrides,
  };
}

describe("successfulNativeTransfers", () => {
  it("keeps value-carrying calls and ignores zero-value and delegate calls", () => {
    expect(
      successfulNativeTransfers([
        call({ value: "5" }),
        call({ value: "0" }),
        call({ value: "9", operation: "delegatecall" }),
      ]),
    ).toEqual([{ from: safe, to: router, amount: 5n }]);
  });

  it("drops a reverted call and everything nested below it", () => {
    expect(
      successfulNativeTransfers([
        call({ depth: 1, value: "1", reverted: true }),
        call({ depth: 2, value: "2" }),
        call({ depth: 1, value: "3" }),
      ]),
    ).toEqual([{ from: safe, to: router, amount: 3n }]);
  });
});

describe("nativeReceivedBy", () => {
  it("sums what other accounts paid in and ignores self-payments", () => {
    const transfers = [
      { from: router, to: safe, amount: 7n },
      { from: other, to: safe, amount: 3n },
      { from: safe, to: safe, amount: 100n },
      { from: safe, to: other, amount: 50n },
    ];
    expect(
      nativeReceivedBy(safe.toUpperCase().replace("0X", "0x"), transfers),
    ).toBe(10n);
  });
});
