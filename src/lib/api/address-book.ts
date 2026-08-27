import { getAddress } from "viem";
import { z } from "zod";

import type { AddressBookEntry } from "@/core/domain";

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
