import { z } from "zod";

import type {
  Hex,
  ModuleAnalysisResult,
  ModuleTransaction,
} from "@/core/domain";

const transactionHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as Hex);

export const moduleTransactionPageQuerySchema = z.object({
  cursor: transactionHashSchema.nullable(),
  limit: z.coerce.number().int().min(1).max(100),
});

export function toModuleTransactionView(
  transaction: ModuleTransaction,
  analysis: ModuleAnalysisResult | null = null,
) {
  return {
    module: transaction.module,
    transactionHash: transaction.transactionHash,
    to: transaction.to,
    value: transaction.value.toString(),
    calldataBytes: Math.max(0, (transaction.data.length - 2) / 2),
    operation: transaction.operation,
    blockNumber: transaction.blockNumber.toString(),
    executedAt: transaction.executedAt,
    analysis: analysis
      ? {
          verdict: analysis.verdict,
          immutable: analysis.immutable,
          findings: analysis.findings.slice(0, 5).map((finding) => ({
            code: finding.code,
            severity: finding.severity,
            title: finding.title,
            detail: finding.detail,
          })),
          coverage: {
            callTrace:
              analysis.simulation?.traceCoverage?.callTrace ?? "unavailable",
            storageDiff:
              analysis.simulation?.traceCoverage?.storageDiff ?? "unavailable",
          },
        }
      : null,
  };
}

export type ModuleTransactionView = ReturnType<typeof toModuleTransactionView>;

export function moduleIsEnabled(
  module: string,
  enabledModules: readonly string[],
): boolean {
  const normalized = module.toLowerCase();
  return enabledModules.some(
    (candidate) => candidate.toLowerCase() === normalized,
  );
}

export function appendUniqueModuleTransactionViews(
  current: readonly ModuleTransactionView[],
  incoming: readonly ModuleTransactionView[],
): readonly ModuleTransactionView[] {
  const known = new Set(
    current.map((transaction) => transaction.transactionHash.toLowerCase()),
  );
  const merged = [...current];

  for (const transaction of incoming) {
    const key = transaction.transactionHash.toLowerCase();
    if (known.has(key)) continue;
    known.add(key);
    merged.push(transaction);
  }

  return merged;
}
