import { getAddress } from "viem";
import { z } from "zod";

import type {
  SafeRef,
  SafeSnapshot,
  SafeTransaction,
  TokenBalance,
} from "@/core/domain";
import type { PersistencePort } from "@/core/ports";
import { toSafeView, type SafeView } from "@/lib/api/safes";

export const safeRouteParamsSchema = z.object({
  chainId: z.coerce
    .number()
    .int()
    .refine((value) => value === 1 || value === 50, "Unsupported chain."),
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Invalid Safe address.")
    .transform((value) => getAddress(value)),
});

export const safeTransactionHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Safe transaction hash.");

export const transactionPageQuerySchema = z.object({
  cursor: z.string().datetime().nullable().default(null),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export interface TransactionView {
  readonly safeTxHash: string;
  readonly nonce: string;
  readonly to: string;
  readonly value: string;
  readonly data: string;
  readonly operation: "call" | "delegatecall";
  readonly status: "pending" | "executed" | "failed" | "replaced";
  readonly confirmations: readonly {
    readonly owner: string;
    readonly signature: string;
    readonly signedAt: number | null;
  }[];
  readonly proposedAt: number;
  readonly executedAt: number | null;
  readonly executedTxHash: string | null;
  readonly blockNumber: string | null;
  readonly blockHash: string | null;
}

export interface BalanceView {
  readonly token: string | null;
  readonly amount: string;
  readonly decimals: number;
  readonly symbol: string;
}

export function toTransactionView(
  transaction: SafeTransaction,
): TransactionView {
  return {
    ...transaction,
    nonce: transaction.nonce.toString(),
    value: transaction.value.toString(),
    blockNumber: transaction.blockNumber?.toString() ?? null,
  };
}

export function toBalanceView(balance: TokenBalance): BalanceView {
  return { ...balance, amount: balance.amount.toString() };
}

export async function resolveSyncStatus(
  persistence: PersistencePort,
  safe: SafeRef,
): Promise<SafeView["syncStatus"]> {
  const cursors = await Promise.all(
    (["multisig", "module", "transfer", "message"] as const).map((stream) =>
      persistence.findSyncCursor(safe, stream),
    ),
  );

  if (cursors.some((cursor) => cursor?.status === "failed")) return "failed";
  if (cursors.every((cursor) => cursor?.status === "complete"))
    return "complete";
  if (cursors.some((cursor) => cursor?.status === "running")) return "syncing";
  return "queued";
}

export async function toDetailedSafeView(
  persistence: PersistencePort,
  safe: SafeSnapshot,
): Promise<SafeView> {
  return toSafeView(safe, await resolveSyncStatus(persistence, safe));
}
