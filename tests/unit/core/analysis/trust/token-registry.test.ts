import { describe, expect, it } from "vitest";

import {
  TOKEN_REGISTRY_VERSION,
  findTokenRegistryEntry,
  resolveTokenIdentity,
  tokenRegistryEntriesForChain,
} from "../../../../../src/core/analysis/trust/token-registry";
import type { Address } from "../../../../../src/core/domain";

const wxdc = "0x951857744785E80e2De051c32EE7b25f9c458C42" as Address;
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
    expect(entries).toHaveLength(3);
    expect(
      entries.every(
        (entry) =>
          entry.reference.startsWith("https://github.com/XSwapProtocol/") &&
          /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt),
      ),
    ).toBe(true);
  });
});
