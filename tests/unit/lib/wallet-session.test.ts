import { describe, expect, it } from "vitest";

import { resolveSessionWalletAddress } from "@/lib/auth/wallet-session";

describe("wallet session selection", () => {
  it("uses the currently active connected wallet", () => {
    expect(resolveSessionWalletAddress("0xactive", "0xprimary")).toBe(
      "0xactive",
    );
  });

  it("falls back to the authenticated primary wallet while connections load", () => {
    expect(resolveSessionWalletAddress(undefined, "0xprimary")).toBe(
      "0xprimary",
    );
  });
});
