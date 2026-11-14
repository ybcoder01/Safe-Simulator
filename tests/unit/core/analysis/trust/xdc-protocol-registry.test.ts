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

  it("classifies every publisher-documented Morpho XDC deployment by role", () => {
    const deployments = [
      [
        "0xEa49B0fE898aF913A3826F9f462eE2cDcb854fD9",
        "Morpho Blue",
        "lending-pool",
        "protocol-whitelist",
        "active",
      ],
      [
        "0x15c7312B0f26aa0AA70B24a0D2AF87B9e7D614A0",
        "Morpho Adaptive Curve IRM",
        "interest-rate-model",
        "identity-only",
        "internal",
      ],
      [
        "0x6Ad93a3aA829514473D3DF67382894A76c7283B4",
        "Morpho Chainlink Oracle V2 Factory",
        "oracle-factory",
        "identity-only",
        "internal",
      ],
      [
        "0x227544d6989cD15c05AAB6dde4F29523dcfdbe2B",
        "Morpho Vault V2 Factory",
        "vault-factory",
        "identity-only",
        "internal",
      ],
      [
        "0x5C00c99F2235439725417E9f037B7D38FfF35d31",
        "Morpho Market V1 Adapter V2 Factory",
        "adapter-factory",
        "identity-only",
        "internal",
      ],
      [
        "0x79A8C4e9E502C1867cAf2E7202f0C6b89aaCd5c1",
        "Morpho Registry",
        "registry",
        "identity-only",
        "internal",
      ],
      [
        "0x7566e3E25b3A11a2eE79AC11C1b96EF5De7438BE",
        "Morpho Vault V1 Adapter Factory",
        "adapter-factory",
        "identity-only",
        "internal",
      ],
      [
        "0x06794E09f058632d402845902Eca89E6F6D12971",
        "Morpho Blue Public Allocator",
        "helper",
        "protocol-whitelist",
        "active",
      ],
      [
        "0xd7cf7F5b2dcdc671882584fD69301b93D38A2202",
        "Morpho Vault Bundles V1",
        "bundler",
        "protocol-whitelist",
        "active",
      ],
      [
        "0xF72a43bcEa57FaECc38eD736AE24f873D0725135",
        "Morpho Vault Exit Bundles V1",
        "bundler",
        "protocol-whitelist",
        "active",
      ],
      [
        "0x0C0DdfD7DE7a2A426DB1eA51b9E19bF148189341",
        "Morpho Blue Bundles V1",
        "bundler",
        "protocol-whitelist",
        "active",
      ],
      [
        "0xed9bdc3E6081db528b6D5CDDf47EcB05337c62A7",
        "Morpho Bundler3",
        "bundler",
        "identity-only",
        "deprecated",
      ],
      [
        "0xAB2Ab6A8bb1082C5d8400D6206c6A13cE413e0c0",
        "Morpho General Adapter 1",
        "adapter",
        "identity-only",
        "deprecated",
      ],
    ] as const;

    for (const [address, label, role, trustPolicy, lifecycle] of deployments) {
      expect(findContractRegistryEntry(50, address)).toMatchObject({
        label,
        protocol: "morpho",
        role,
        trustPolicy,
        lifecycle,
        reviewedAt: "2026-11-12",
      });
    }
  });
});
