import { describe, expect, it } from "vitest";

import {
  isLikelyLiquidityPosition,
  resolveTokenPresentation,
} from "../../../../src/lib/api/token-presentation";

describe("token presentation", () => {
  it("uses the bundled XDC mark for the native asset", () => {
    expect(resolveTokenPresentation(50, null, "XDC")).toEqual({
      token: null,
      name: "XDC",
      symbol: "XDC",
      kind: "fungible",
      logoKey: "wxdc",
      known: true,
    });
  });

  it("prefers reviewed identity metadata over an upstream symbol", () => {
    expect(
      resolveTokenPresentation(
        50,
        "0x7054f74d6cB418e987b73c9f3c23e5cEc18217b2",
        "Untrusted symbol",
      ),
    ).toMatchObject({
      name: "YieldNest RWA MAX",
      symbol: "ynRWAx",
      kind: "fungible",
      logoKey: "ynrwax",
      known: true,
    });
  });

  it("uses a distinct fallback for likely liquidity-position tokens", () => {
    expect(isLikelyLiquidityPosition("XDC-USDC LP")).toBe(true);
    expect(isLikelyLiquidityPosition("POOL SHARE")).toBe(true);
    expect(isLikelyLiquidityPosition("USDC")).toBe(false);

    expect(
      resolveTokenPresentation(
        50,
        "0x0000000000000000000000000000000000000042",
        "XDC-USDC LP",
      ),
    ).toMatchObject({
      name: "Unreviewed liquidity-position token",
      symbol: "XDC-USDC LP",
      kind: "liquidity-position",
      logoKey: "fallback-lp",
      known: false,
    });
  });

  it("does not represent malformed or unknown tokens as reviewed", () => {
    expect(resolveTokenPresentation(50, "not-an-address", "")).toMatchObject({
      name: "Unknown token",
      symbol: "Unknown",
      kind: "unknown",
      logoKey: "fallback-token",
      known: false,
    });
  });
});
