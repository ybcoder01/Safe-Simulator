import { describe, expect, it } from "vitest";

import {
  contractRegistryEntriesForChain,
  findContractRegistryEntry,
} from "../../../../../src/core/analysis/trust/contract-registry";
import type { Address } from "../../../../../src/core/domain";

const safeL2 = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as Address;
const fallbackHandler = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address;

describe("authoritative contract registry", () => {
  it("resolves pinned Safe deployments case-insensitively on supported chains", () => {
    expect(findContractRegistryEntry(50, safeL2)).toMatchObject({
      label: "Safe v1.4.1 L2 Singleton",
      source: "safe-deployments",
    });
    expect(
      findContractRegistryEntry(50, fallbackHandler.toLowerCase() as Address),
    ).toMatchObject({
      label: "Safe v1.4.1 Compatibility Fallback Handler",
      source: "safe-deployments",
    });
    expect(findContractRegistryEntry(1, safeL2)).not.toBeNull();
  });

  it("does not project a deployment onto an unsupported chain", () => {
    expect(findContractRegistryEntry(51, safeL2)).toBeNull();
  });

  it("keeps entries unique and linked to authoritative references", () => {
    const entries = contractRegistryEntriesForChain(50);
    const addresses = entries.map((entry) => entry.address.toLowerCase());

    expect(new Set(addresses).size).toBe(addresses.length);
    expect(entries.length).toBeGreaterThan(0);
    expect(
      entries.every(
        (entry) =>
          entry.label.length > 0 &&
          entry.reference.startsWith("https://") &&
          (entry.source === "safe-deployments" ||
            entry.source === "evm-specification"),
      ),
    ).toBe(true);
  });
});
