import { describe, expect, it } from "vitest";

import { findContractRegistryEntry } from "@/core/analysis/trust/contract-registry";
import {
  readableRegistryLabel,
  xdcProtocolRegistryEntries,
} from "@/core/analysis/trust/xdc-protocol-registry";

describe("readableRegistryLabel", () => {
  it("drops a protocol name that is repeated at the start", () => {
    expect(readableRegistryLabel("Silo Silo Router V2")).toBe("Silo Router V2");
    expect(readableRegistryLabel("Silo Silo")).toBe("Silo");
    expect(readableRegistryLabel("Silo Silo Virtual Asset USD")).toBe(
      "Silo Virtual Asset USD",
    );
  });

  it("leaves other labels alone", () => {
    expect(readableRegistryLabel("Silo Tower")).toBe("Silo Tower");
    expect(readableRegistryLabel("Wrapped Savings rUSD")).toBe(
      "Wrapped Savings rUSD",
    );
    expect(readableRegistryLabel("Silo Router V2 Implementation")).toBe(
      "Silo Router V2 Implementation",
    );
  });
});

describe("XDC protocol registry labels", () => {
  it("never doubles a word at the start of a label", () => {
    const doubled = xdcProtocolRegistryEntries.filter((entry) =>
      /^(\S+) \1(?= |$)/.test(entry.label),
    );
    expect(doubled).toEqual([]);
  });

  it("names the official Silo router plainly", () => {
    expect(
      findContractRegistryEntry(
        50,
        "0x4fFf70C17fb974121a1Ad64C97b04a2e38DbfE7C",
      )?.label,
    ).toBe("Silo Router V2");
  });

  it("identifies the Yield Network USDC vault as Morpho without assigning USDC to Fathom", () => {
    expect(
      findContractRegistryEntry(
        50,
        "0x1ac19bEc163b445fbd4B8Ddc616e4002126Efa5A",
      ),
    ).toMatchObject({
      label: "Morpho Yield Network USDC Vault",
      protocol: "morpho",
      role: "vault",
      trustPolicy: "protocol-whitelist",
      lifecycle: "active",
    });
    expect(
      findContractRegistryEntry(
        50,
        "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1",
      ),
    ).toBeNull();
  });
});
