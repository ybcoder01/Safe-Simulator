import { describe, expect, it } from "vitest";

import {
  CONTRACT_REGISTRY_VERSION,
  contractRegistryEntriesForChain,
  findContractRegistryEntry,
} from "../../../../../src/core/analysis/trust/contract-registry";
import type { Address } from "../../../../../src/core/domain";

const safeL2 = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as Address;
const fallbackHandler = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address;
const xswapV3Router = "0xecf4ea7907e779b8a7d0f90cb95fe06f43b610fb" as Address;
const morphoBlue = "0xEa49B0fE898aF913A3826F9f462eE2cDcb854fD9" as Address;
const curveAdmin = "0xabc336d4C71ad275695744d32DdB1d8266Db1cbF" as Address;

describe("authoritative contract registry", () => {
  it("resolves pinned Safe deployments case-insensitively on supported chains", () => {
    expect(findContractRegistryEntry(50, safeL2)).toMatchObject({
      label: "Safe v1.4.1 L2 Singleton",
      source: "safe-deployments",
      role: "safe-singleton",
    });
    expect(
      findContractRegistryEntry(50, fallbackHandler.toLowerCase() as Address),
    ).toMatchObject({
      label: "Safe v1.4.1 Compatibility Fallback Handler",
      source: "safe-deployments",
      role: "fallback-handler",
    });
    expect(findContractRegistryEntry(1, safeL2)).not.toBeNull();
  });

  it("pins publisher-documented XSwap contracts only to XDC mainnet", () => {
    expect(findContractRegistryEntry(50, xswapV3Router)).toMatchObject({
      label: "XSwap V3 Router",
      protocol: "xswap",
      category: "protocol",
      role: "dex-router",
      verification: "publisher-documented-bytecode-present",
      trustPolicy: "protocol-whitelist",
      lifecycle: "active",
    });
    expect(findContractRegistryEntry(1, xswapV3Router)).toBeNull();
    expect(findContractRegistryEntry(51, xswapV3Router)).toBeNull();
  });

  it("separates user-facing protocol contracts from identity-only infrastructure", () => {
    expect(findContractRegistryEntry(50, morphoBlue)).toMatchObject({
      protocol: "morpho",
      role: "lending-pool",
      trustPolicy: "protocol-whitelist",
      lifecycle: "active",
    });
    expect(findContractRegistryEntry(50, curveAdmin)).toBeNull();

    const entries = contractRegistryEntriesForChain(50);
    expect(
      entries
        .filter((entry) => entry.trustPolicy === "protocol-whitelist")
        .every((entry) => entry.lifecycle === "active"),
    ).toBe(true);
    expect(entries.length).toBeGreaterThan(150);
  });

  it("does not project a Safe deployment onto an unsupported chain", () => {
    expect(findContractRegistryEntry(51, safeL2)).toBeNull();
  });

  it("keeps entries unique, versioned, and linked to reviewable evidence", () => {
    const entries = contractRegistryEntriesForChain(50);
    const addresses = entries.map((entry) => entry.address.toLowerCase());

    expect(CONTRACT_REGISTRY_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(new Set(addresses).size).toBe(addresses.length);
    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.every(
        (entry) =>
          entry.label.length > 0 &&
          entry.reference.startsWith("https://") &&
          /^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt),
      ),
    ).toBe(true);
  });
});
