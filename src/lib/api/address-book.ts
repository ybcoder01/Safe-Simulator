import { getAddress } from "viem";
import { z } from "zod";

import { findContractRegistryEntry } from "@/core/analysis/trust/contract-registry";
import type { Address, AddressBookEntry } from "@/core/domain";

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 20-byte EVM address.")
  .transform((value) => getAddress(value));

export const addressBookInputSchema = z.object({
  address: addressSchema,
  label: z.string().trim().min(1).max(80),
  trust: z.enum(["trusted", "flagged"]),
});

export const addressBookDeleteSchema = z.object({
  address: addressSchema,
});

export interface AddressBookView {
  readonly address: string;
  readonly label: string;
  readonly trust: "trusted" | "flagged";
}

export function toAddressBookView(entry: AddressBookEntry): AddressBookView {
  return entry;
}

export interface AddressBookSuggestion {
  readonly address: string;
  readonly label: string | null;
  readonly roles: readonly string[];
}

export function suggestedAddressBookLabel(
  suggestion: AddressBookSuggestion,
): string {
  const existingLabel = suggestion.label?.trim();
  if (existingLabel) return existingLabel.slice(0, 80);

  const role = suggestion.roles[0]?.replaceAll("-", " ") ?? "address";
  const title = role.charAt(0).toUpperCase() + role.slice(1);
  const shortened = `${suggestion.address.slice(0, 10)}…${suggestion.address.slice(-8)}`;
  return `${title} ${shortened}`.slice(0, 80);
}

export function availableAddressBookSuggestions(
  suggestions: readonly AddressBookSuggestion[],
  entries: readonly AddressBookView[],
): AddressBookSuggestion[] {
  const configured = new Set(
    entries.map((entry) => entry.address.toLowerCase()),
  );
  const seen = new Set<string>();

  return suggestions.filter((suggestion) => {
    const key = suggestion.address.toLowerCase();
    if (configured.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface AddressDisplay {
  readonly label: string;
  readonly trust: "trusted" | "flagged" | "known";
  readonly source: "profile" | "registry";
}

export function resolveAddressDisplay(
  chainId: number,
  address: string,
  entries: readonly AddressBookView[],
): AddressDisplay | null {
  const normalized = addressSchema.safeParse(address);
  if (!normalized.success) return null;

  const profileEntry = entries.find(
    (entry) => entry.address.toLowerCase() === normalized.data.toLowerCase(),
  );
  if (profileEntry) {
    return {
      label: profileEntry.label,
      trust: profileEntry.trust,
      source: "profile",
    };
  }

  if (chainId !== 1 && chainId !== 50) return null;
  const registryEntry = findContractRegistryEntry(
    chainId,
    normalized.data as Address,
  );
  return registryEntry
    ? {
        label: registryEntry.label,
        trust: "known",
        source: "registry",
      }
    : null;
}
