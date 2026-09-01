import type { Hex, SafeRef } from "@/core/domain";
import {
  resolveNeutralTransactionAnalysis,
  TRANSACTION_ANALYSIS_ENGINE_VERSION,
  type NeutralTransactionAnalysisPorts,
} from "@/lib/api/transaction-analysis";

interface AnalyzeJob {
  readonly type: "analyze";
  readonly safe: SafeRef;
  readonly safeTxHash: string;
}

export type AnalyzeJobResult =
  | {
      readonly status: "skipped";
      readonly reason: "transaction_not_found";
    }
  | {
      readonly status: "cached";
      readonly verdict: string;
      readonly immutable: true;
    }
  | {
      readonly status: "complete";
      readonly verdict: string;
      readonly immutable: boolean;
    };

export async function runAnalyzeJob(
  job: AnalyzeJob,
  ports: NeutralTransactionAnalysisPorts,
): Promise<AnalyzeJobResult> {
  const safeTxHash = job.safeTxHash as Hex;
  const transaction = await ports.persistence.findTransaction(
    job.safe,
    safeTxHash,
  );
  if (!transaction) {
    return { status: "skipped", reason: "transaction_not_found" };
  }

  const existing = await ports.persistence.findAnalysis(
    safeTxHash,
    TRANSACTION_ANALYSIS_ENGINE_VERSION,
  );
  if (existing?.immutable) {
    return {
      status: "cached",
      verdict: existing.verdict,
      immutable: true,
    };
  }

  const analysis = await resolveNeutralTransactionAnalysis(transaction, ports);
  return {
    status: "complete",
    verdict: analysis.persisted.verdict,
    immutable: analysis.persisted.immutable,
  };
}
