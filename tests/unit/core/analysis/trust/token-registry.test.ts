import { describe, expect, it } from "vitest";

import {
  TOKEN_REGISTRY_VERSION,
  findTokenRegistryEntry,
  resolveTokenIdentity,
  tokenRegistryEntriesForChain,
} from "../../../../../src/core/analysis/trust/token-registry";
import type { Address } from "../../../../../src/core/domain";

const wxdc = "0x951857744785E80e2De051c32EE7b25f9c458C42" as Address;
const fathomUsdc = "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1" as Address;
const ynRWAx = "0x7054f74d6cB418e987b73c9f3c23e5cEc18217b2" as Address;
const wsrUsd = "0x4809010926aec940b550D34a46A52739f996D75D" as Address;
const unknown = "0x0000000000000000000000000000000000000042" as Address;

describe("token identity registry", () => {
  it("resolves a reviewed token case-insensitively", () => {
    expect(
      findTokenRegistryEntry(50, wxdc.toLowerCase() as Address),
    ).toMatchObject({
      name: "Wrapped XDC",
      symbol: "WXDC",
      decimals: 18,
      logoKey: "wxdc",
    });
    expect(findTokenRegistryEntry(1, wxdc)).toBeNull();
  });

  it("includes the publisher-confirmed XDC token identities", () => {
    expect(findTokenRegistryEntry(50, fathomUsdc)).toMatchObject({
      name: "Fathom USDC Underlying",
      symbol: "USDC",
      decimals: 6,
      logoKey: "usdc",
      verification: "publisher-documented",
      reference: "https://docs.fathom.fi/lending/deployments/xdc-network",
    });
    expect(findTokenRegistryEntry(50, ynRWAx)).toMatchObject({
      name: "YieldNest RWA MAX",
      symbol: "ynRWAx",
      decimals: 18,
      logoKey: "ynrwax",
      verification: "publisher-documented",
    });
    expect(findTokenRegistryEntry(50, wsrUsd)).toMatchObject({
      name: "Wrapped Savings rUSD",
      symbol: "wsrUSD",
      decimals: 18,
      logoKey: "wsrusd",
      verification: "publisher-documented",
    });
  });

  it("uses deterministic unknown and liquidity-position fallbacks", () => {
    expect(resolveTokenIdentity(50, unknown)).toMatchObject({
      known: false,
      kind: "unknown",
      logoKey: "fallback-token",
      reference: null,
    });
    expect(
      resolveTokenIdentity(50, unknown, { liquidityPosition: true }),
    ).toMatchObject({
      known: false,
      kind: "liquidity-position",
      logoKey: "fallback-lp",
      reference: null,
    });
  });

  it("keeps reviewed entries unique and versioned", () => {
    const entries = tokenRegistryEntriesForChain(50);
    const addresses = entries.map((entry) => entry.address.toLowerCase());

    expect(TOKEN_REGISTRY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(new Set(addresses).size).toBe(addresses.length);
    expect(entries).toHaveLength(6);
    expect(
      entries.every(
        (entry) =>
          /^https:\/\/(?:github\.com|docs\.fathom\.fi)\//.test(
            entry.reference,
          ) && /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt),
      ),
    ).toBe(true);
  });
});
