import type { Hex, SafeRef } from "@/core/domain";
import {
  MODULE_ANALYSIS_ENGINE_VERSION,
  resolveModuleAnalysis,
  type ModuleAnalysisPorts,
} from "@/lib/api/module-analysis";

interface AnalyzeModuleJob {
  readonly type: "analyze-module";
  readonly safe: SafeRef;
  readonly transactionHash: string;
}

export type AnalyzeModuleJobResult =
  | {
      readonly status: "skipped";
      readonly reason: "module_transaction_not_found";
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

export async function runAnalyzeModuleJob(
  job: AnalyzeModuleJob,
  ports: ModuleAnalysisPorts,
): Promise<AnalyzeModuleJobResult> {
  const transactionHash = job.transactionHash as Hex;
  const transaction = await ports.persistence.findModuleTransaction(
    job.safe,
    transactionHash,
  );
  if (!transaction) {
    return { status: "skipped", reason: "module_transaction_not_found" };
  }

  const existing = await ports.persistence.findModuleAnalysis(
    transactionHash,
    MODULE_ANALYSIS_ENGINE_VERSION,
  );
  if (existing?.immutable) {
    return {
      status: "cached",
      verdict: existing.verdict,
      immutable: true,
    };
  }

  const analysis = await resolveModuleAnalysis(transaction, ports);
  return {
    status: "complete",
    verdict: analysis.verdict,
    immutable: analysis.immutable,
  };
}
