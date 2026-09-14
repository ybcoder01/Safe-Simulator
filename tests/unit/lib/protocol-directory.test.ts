import { describe, expect, it } from "vitest";

import {
  filterProtocolDirectory,
  type ProtocolDirectoryEntry,
} from "../../../src/lib/protocol-directory";

const entries = [
  {
    address: "0x1111111111111111111111111111111111111111",
    label: "Morpho Blue",
    lifecycle: "active",
    logoKey: "morpho",
    protocol: "morpho",
    reference: "https://example.com/morpho",
    role: "lending-pool",
    trustPolicy: "protocol-whitelist",
  },
  {
    address: "0x2222222222222222222222222222222222222222",
    label: "Morpho Legacy Adapter",
    lifecycle: "deprecated",
    logoKey: "morpho",
    protocol: "morpho",
    reference: "https://example.com/morpho",
    role: "adapter",
    trustPolicy: "identity-only",
  },
  {
    address: "0x3333333333333333333333333333333333333333",
    label: "Oku Swap Router",
    lifecycle: "active",
    logoKey: "oku",
    protocol: "oku-uniswap",
    reference: "https://example.com/oku",
    role: "dex-router",
    trustPolicy: "protocol-whitelist",
  },
] as const satisfies readonly ProtocolDirectoryEntry[];

describe("protocol directory filtering", () => {
  it("returns a whole protocol group when its public label matches", () => {
    const groups = filterProtocolDirectory(entries, "morpho", "all");

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: "Morpho", protocol: "morpho" });
    expect(groups[0]?.entries).toHaveLength(2);
  });

  it("finds a single contract by role or exact address", () => {
    expect(
      filterProtocolDirectory(entries, "dex router", "all")[0]?.entries,
    ).toHaveLength(1);
    expect(
      filterProtocolDirectory(
        entries,
        "0x2222222222222222222222222222222222222222",
        "all",
      )[0]?.entries[0]?.label,
    ).toBe("Morpho Legacy Adapter");
  });

  it("combines text and status filters", () => {
    const groups = filterProtocolDirectory(entries, "morpho", "whitelisted");

    expect(groups[0]?.entries.map((entry) => entry.label)).toEqual([
      "Morpho Blue",
    ]);
    expect(filterProtocolDirectory(entries, "oku", "deprecated")).toEqual([]);
  });
});
