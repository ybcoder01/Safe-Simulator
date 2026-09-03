import { findContractRegistryEntry } from "@/core/analysis/trust/contract-registry";
import type { Address, DecodedParameter } from "@/core/domain";

export interface DecodedAddressField {
  readonly address: Address;
  readonly role: string;
  readonly source: "parameter" | "registry";
}

const ADDRESS_PATTERN = /0x[0-9a-fA-F]{40}/g;
const MAX_VALUE_LENGTH = 32_768;
const MAX_ADDRESSES = 32;

function parameterRole(name: string): string {
  const normalized = name
    .replace(/^_/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("-", " ")
    .trim()
    .toLowerCase();
  return normalized ? `${normalized} parameter` : "address parameter";
}

export function decodedAddressFields(
  chainId: number,
  parameter: Pick<DecodedParameter, "name" | "type" | "value">,
): readonly DecodedAddressField[] {
  if (!parameter.type.toLowerCase().includes("address")) return [];

  const matches =
    parameter.value.slice(0, MAX_VALUE_LENGTH).match(ADDRESS_PATTERN) ?? [];
  const unique = new Map<string, Address>();
  for (const match of matches.slice(0, MAX_ADDRESSES)) {
    unique.set(match.toLowerCase(), match as Address);
  }

  return [...unique.values()].map((address) => {
    const registry = findContractRegistryEntry(chainId, address);
    return {
      address,
      role: registry
        ? registry.role.replaceAll("-", " ")
        : parameterRole(parameter.name),
      source: registry ? "registry" : "parameter",
    };
  });
}
