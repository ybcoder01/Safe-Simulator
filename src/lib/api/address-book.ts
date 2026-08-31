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
