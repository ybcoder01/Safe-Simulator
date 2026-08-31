import { getAddress } from "viem";
import { z } from "zod";

import type { Address, SafeSnapshot } from "@/core/domain";

export const importSafeInputSchema = z.object({
  chainId: z
    .number()
    .int()
    .refine((value) => value === 1 || value === 50, "Unsupported chain."),
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 20-byte EVM address.")
    .transform((value) => getAddress(value)),
});

export const discoverSafesInputSchema = z.object({
  chainId: z.coerce
    .number()
    .int()
    .refine((value) => value === 1 || value === 50, "Unsupported chain."),
  owner: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 20-byte EVM address.")
    .transform((value) => getAddress(value).toLowerCase() as Address),
});

export interface SafeView {
  readonly chainId: number;
  readonly address: string;
  readonly owners: readonly string[];
  readonly threshold: number;
  readonly nonce: string;
  readonly version: string | null;
  readonly guard: string | null;
  readonly modules: readonly string[];
  readonly implementation: string | null;
  readonly observedAt: number;
  readonly syncStatus: "queued" | "syncing" | "complete" | "failed";
}

export function toSafeView(
  safe: SafeSnapshot,
  syncStatus: SafeView["syncStatus"] = "queued",
): SafeView {
  return { ...safe, nonce: safe.nonce.toString(), syncStatus };
}
