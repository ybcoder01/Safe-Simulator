import { describe, expect, it } from "vitest";

import {
  firstWalletAccount,
  resolveSessionWalletAddress,
  walletAddressesMatch,
} from "@/lib/auth/wallet-session";

describe("wallet session selection", () => {
  it("keeps the wallet that completed authentication", () => {
    expect(resolveSessionWalletAddress("0xactive", "0xprimary")).toBe(
      "0xprimary",
    );
  });

  it("falls back to the active wallet while the Privy user loads", () => {
    expect(resolveSessionWalletAddress("0xactive", undefined)).toBe("0xactive");
  });

  it("compares wallet addresses without checksum casing", () => {
    expect(walletAddressesMatch("0xAbCd", "0xabcd")).toBe(true);
    expect(walletAddressesMatch("0xAbCd", "0x1234")).toBe(false);
    expect(walletAddressesMatch(undefined, "0x1234")).toBe(false);
  });

  it("reads the first provider account defensively", () => {
    expect(firstWalletAccount([" 0xabc ", "0xdef"])).toBe("0xabc");
    expect(firstWalletAccount([])).toBeNull();
    expect(firstWalletAccount("0xabc")).toBeNull();
  });
});
