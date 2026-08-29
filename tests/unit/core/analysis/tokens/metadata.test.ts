import { describe, expect, it } from "vitest";

import {
  decodeTokenDecimals,
  decodeTokenSymbol,
  formatTokenAmount,
} from "../../../../../src/core/analysis/tokens/metadata";
import type { Hex } from "../../../../../src/core/domain";

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function dynamicSymbol(value: string): Hex {
  const bytes = Array.from(value).map((character) =>
    character.charCodeAt(0).toString(16).padStart(2, "0"),
  );
  const data = bytes.join("").padEnd(Math.ceil(bytes.length / 32) * 64, "0");
  return (`0x${word(32n)}${word(BigInt(bytes.length))}${data}`) as Hex;
}

function bytes32Symbol(value: string): Hex {
  return (
    "0x" +
    Array.from(value)
      .map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
      .padEnd(64, "0")
  ) as Hex;
}

describe("token metadata decoding", () => {
  it("decodes bounded ABI decimals", () => {
    expect(decodeTokenDecimals((`0x${word(18n)}`) as Hex)).toBe(18);
    expect(decodeTokenDecimals("0x12")).toBeNull();
    expect(decodeTokenDecimals((`0x${word(256n)}`) as Hex)).toBeNull();
  });

  it("decodes standard dynamic and common bytes32 symbols", () => {
    expect(decodeTokenSymbol(dynamicSymbol("USDC"))).toBe("USDC");
    expect(decodeTokenSymbol(bytes32Symbol("WETH"))).toBe("WETH");
  });

  it("rejects malformed, oversized, and control-character symbols", () => {
    expect(decodeTokenSymbol("0x")).toBeNull();
    expect(decodeTokenSymbol(dynamicSymbol("A".repeat(33)))).toBeNull();
    expect(decodeTokenSymbol(bytes32Symbol("BAD\n"))).toBeNull();
  });
});

describe("formatTokenAmount", () => {
  it("formats exact amounts without rounding", () => {
    expect(formatTokenAmount("12500000", 6)).toBe("12.5");
    expect(formatTokenAmount("1", 18)).toBe("0.000000000000000001");
    expect(formatTokenAmount("1000", 0)).toBe("1000");
    expect(formatTokenAmount("0", 6)).toBe("0");
  });

  it("keeps unsupported inputs unavailable", () => {
    expect(formatTokenAmount("-1", 18)).toBeNull();
    expect(formatTokenAmount("1", null)).toBeNull();
    expect(formatTokenAmount("1", 37)).toBeNull();
  });
});
