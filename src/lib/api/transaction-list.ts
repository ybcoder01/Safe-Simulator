import type {
  AnalysisResult,
  SafeRef,
  SafeTransaction,
} from "@/core/domain";
import type { PersistencePort } from "@/core/ports";
import {
  toTransactionView,
  type TransactionAnalysisView,
  type TransactionView,
} from "@/lib/api/safe-details";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/analysis-version";

function toAnalysisView(result: AnalysisResult): TransactionAnalysisView {
  return {
    baselineVerdict: result.verdict,
    analyzedAt: result.createdAt,
    immutable: result.immutable,
  };
}

export async function resolveTransactionViews(
  persistence: Pick<PersistencePort, "findAnalyses">,
  safe: SafeRef,
  transactions: readonly SafeTransaction[],
): Promise<readonly TransactionView[]> {
  const analyses = await persistence.findAnalyses(
    safe,
    transactions.map((transaction) => transaction.safeTxHash),
    TRANSACTION_ANALYSIS_ENGINE_VERSION,
  );
  const byHash = new Map(
    analyses.map((analysis) => [
      analysis.safeTxHash.toLowerCase(),
      toAnalysisView(analysis),
    ]),
  );

  return transactions.map((transaction) =>
    toTransactionView(
      transaction,
      byHash.get(transaction.safeTxHash.toLowerCase()) ?? null,
    ),
  );
}
