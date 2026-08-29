import { getAddress } from "viem";
import { z } from "zod";

import type {
  DecodedCall,
  Hex,
  SafeRef,
  SafeSnapshot,
  SafeTransaction,
  SyncCursor,
  TokenBalance,
} from "@/core/domain";
import { knownCallSummary } from "@/core/analysis/decoding/calldata";
import type { PersistencePort, SafeDataPort } from "@/core/ports";
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
  .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid Safe transaction hash.")
  .transform((value) => value as Hex);

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
  readonly summary: string | null;
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

export interface TransactionGroups {
  readonly pending: readonly TransactionView[];
  readonly history: readonly TransactionView[];
}

export function groupTransactionViews(
  transactions: readonly TransactionView[],
): TransactionGroups {
  const pending: TransactionView[] = [];
  const history: TransactionView[] = [];

  for (const transaction of transactions) {
    if (transaction.status === "pending") {
      pending.push(transaction);
    } else {
      history.push(transaction);
    }
  }

  return { pending, history };
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
    summary: knownCallSummary(transaction.data, transaction.operation),
    value: transaction.value.toString(),
    blockNumber: transaction.blockNumber?.toString() ?? null,
  };
}

export async function resolveDecodedCall(
  safeData: SafeDataPort,
  transaction: SafeTransaction,
): Promise<DecodedCall | null> {
  if (transaction.data === "0x") return null;

  try {
    return await safeData.decodeTransactionData(
      transaction.safe,
      transaction.to,
      transaction.data,
    );
  } catch (error) {
    console.warn("[safe-decoder] Calldata decoding unavailable.", {
      chainId: transaction.safe.chainId,
      safeTxHash: transaction.safeTxHash,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function toBalanceView(balance: TokenBalance): BalanceView {
  return { ...balance, amount: balance.amount.toString() };
}

const syncStreams = ["multisig", "module", "transfer", "message"] as const;

export interface SyncSummaryView {
  readonly status: SafeView["syncStatus"];
  readonly completedStreams: number;
  readonly totalStreams: number;
  readonly lastFullSyncAt: number | null;
  readonly latestActivityAt: number | null;
}

export function summarizeSyncCursors(
  cursors: readonly (SyncCursor | null)[],
): SyncSummaryView {
  const present = cursors.filter(
    (cursor): cursor is SyncCursor => cursor !== null,
  );
  const completedStreams = present.filter(
    (cursor) => cursor.status === "complete",
  ).length;
  const status: SafeView["syncStatus"] = present.some(
    (cursor) => cursor.status === "failed",
  )
    ? "failed"
    : cursors.every((cursor) => cursor?.status === "complete")
      ? "complete"
      : present.some((cursor) => cursor.status === "running")
        ? "syncing"
        : "queued";
  const timestamps = present.map((cursor) => cursor.updatedAt);

  return {
    status,
    completedStreams,
    totalStreams: syncStreams.length,
    lastFullSyncAt:
      status === "complete" && timestamps.length === syncStreams.length
        ? Math.min(...timestamps)
        : null,
    latestActivityAt: timestamps.length > 0 ? Math.max(...timestamps) : null,
  };
}

export async function resolveSyncSummary(
  persistence: PersistencePort,
  safe: SafeRef,
): Promise<SyncSummaryView> {
  const cursors = await Promise.all(
    syncStreams.map((stream) => persistence.findSyncCursor(safe, stream)),
  );
  return summarizeSyncCursors(cursors);
}

export async function resolveSyncStatus(
  persistence: PersistencePort,
  safe: SafeRef,
): Promise<SafeView["syncStatus"]> {
  return (await resolveSyncSummary(persistence, safe)).status;
}

export async function toDetailedSafeView(
  persistence: PersistencePort,
  safe: SafeSnapshot,
): Promise<SafeView> {
  return toSafeView(safe, await resolveSyncStatus(persistence, safe));
}
