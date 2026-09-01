import type {
  Finding,
  Hex,
  ModuleAnalysisResult,
  ModuleTransaction,
  SafeTransaction,
  SimulationOutput,
  Verdict,
} from "@/core/domain";
import type {
  AbiPort,
  ChainPort,
  PersistencePort,
  SafeDataPort,
  SimulationPort,
} from "@/core/ports";
import { resolveApprovalRisk } from "@/lib/api/approval-risk";
import { resolveContractInsight } from "@/lib/api/contract-insight";
import { resolveEvidenceVerdict } from "@/lib/api/evidence-verdict";
import {
  executionInsightFromReplay,
  unavailableExecutionInsight,
} from "@/lib/api/execution-insight";
import { resolveStorageChangeAnalysis } from "@/lib/api/storage-changes";

export const MODULE_ANALYSIS_ENGINE_VERSION = "module-analysis-v1";

export interface ModuleAnalysisPorts {
  readonly abi: AbiPort;
  readonly chain: ChainPort;
  readonly persistence: PersistencePort;
  readonly safeData: SafeDataPort;
  readonly simulation: SimulationPort;
  readonly now: () => number;
}

const privilegedPathFinding = (module: ModuleTransaction["module"]): Finding => ({
  code: "module-execution-path",
  severity: "warning",
  title: "Privileged module execution",
  detail:
    "This transaction was executed by a Safe module and did not use the normal owner-confirmation path. Module authority must be reviewed independently.",
  addresses: [module],
});

function analysisVerdict(
  baseline: Verdict,
  anchorMismatch: boolean,
): Verdict {
  if (anchorMismatch || baseline === "flagged") return "flagged";
  return "unverified";
}

function executedTransaction(
  transaction: ModuleTransaction,
  blockHash: Hex | null,
): SafeTransaction {
  return {
    safe: transaction.safe,
    safeTxHash: transaction.transactionHash,
    nonce: 0n,
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
    operation: transaction.operation,
    status: "executed",
    confirmations: [],
    proposedAt: transaction.executedAt,
    executedAt: transaction.executedAt,
    executedTxHash: transaction.transactionHash,
    blockNumber: transaction.blockNumber,
    blockHash,
  };
}

function anchorFinding(transaction: ModuleTransaction): Finding {
  return {
    code: "module-replay-anchor-unverified",
    severity: "warning",
    title: "Replay anchor is not independently verified",
    detail:
      "The mined transaction block could not be checked independently. Replay evidence remains refreshable and is not treated as immutable.",
    addresses: [transaction.module],
  };
}

function mismatchFinding(transaction: ModuleTransaction): Finding {
  return {
    code: "module-replay-anchor-mismatch",
    severity: "critical",
    title: "Replay anchor mismatch",
    detail:
      "The replay block does not match the canonical transaction anchor or the persisted module block. This evidence is flagged and remains refreshable.",
    addresses: [transaction.module],
  };
}

export async function resolveModuleAnalysis(
  transaction: ModuleTransaction,
  ports: ModuleAnalysisPorts,
): Promise<ModuleAnalysisResult> {
  const anchor = await ports.chain
    .getTransactionBlock(
      transaction.safe.chainId,
      transaction.transactionHash,
    )
    .catch(() => null);
  const normalized = executedTransaction(transaction, anchor?.blockHash ?? null);
  const contractPromise = resolveContractInsight(
    ports.safeData,
    ports.abi,
    normalized,
  );
  let simulation: SimulationOutput | null = null;
  let execution;

  try {
    simulation = await ports.simulation.replay(
      transaction.safe.chainId,
      transaction.transactionHash,
    );
    execution = executionInsightFromReplay(
      simulation,
      transaction.safe.address,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Module replay is unavailable.";
    execution = unavailableExecutionInsight(message);
  }

  const contract = await contractPromise;
  const [approvalRisk, storageAnalysis] = await Promise.all([
    resolveApprovalRisk(ports.chain, normalized, contract, execution),
    resolveStorageChangeAnalysis(
      ports.abi,
      transaction.safe.chainId,
      execution,
    ),
  ]);
  const baseline = resolveEvidenceVerdict(
    normalized,
    contract,
    execution,
    [],
    approvalRisk,
    storageAnalysis,
  );
  const anchorMismatch =
    simulation !== null &&
    (anchor === null ||
      anchor.blockNumber !== transaction.blockNumber ||
      anchor.blockHash.toLowerCase() !== simulation.blockHash.toLowerCase() ||
      simulation.blockNumber !== transaction.blockNumber);
  const findings: Finding[] = [privilegedPathFinding(transaction.module)];

  if (anchor === null) findings.push(anchorFinding(transaction));
  if (anchorMismatch) findings.push(mismatchFinding(transaction));
  findings.push(...baseline.findings);

  const result: ModuleAnalysisResult = {
    transactionHash: transaction.transactionHash,
    module: transaction.module,
    engineVersion: MODULE_ANALYSIS_ENGINE_VERSION,
    verdict: analysisVerdict(baseline.verdict, anchorMismatch),
    findings,
    simulation,
    createdAt: ports.now(),
    immutable: simulation !== null && anchor !== null && !anchorMismatch,
  };

  await ports.persistence.saveModuleAnalysis(result);
  return result;
}
