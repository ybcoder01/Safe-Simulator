import type {
  AnalysisResult,
  Hex,
  SafeTransaction,
  SimulationOutput,
} from "@/core/domain";
import type {
  AbiPort,
  CachePort,
  ChainPort,
  PersistencePort,
  SafeDataPort,
  SimulationPort,
} from "@/core/ports";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/analysis-version";
import {
  resolveApprovalRisk,
  type ApprovalRiskResult,
} from "@/lib/api/approval-risk";
import {
  resolveContractInsight,
  type ContractInsight,
} from "@/lib/api/contract-insight";
import { resolveEvidenceVerdict } from "@/lib/api/evidence-verdict";
import {
  EXECUTION_EVIDENCE_ENGINE_VERSION,
  resolveExecutionInsight,
  type ExecutionInsight,
} from "@/lib/api/execution-insight";
import {
  resolveStorageChangeAnalysis,
  type StorageChangeAnalysis,
} from "@/lib/api/storage-changes";
import { keccak256 } from "viem";

export { TRANSACTION_ANALYSIS_ENGINE_VERSION };

export interface NeutralTransactionAnalysisPorts {
  readonly abi: AbiPort;
  readonly cache: CachePort;
  readonly chain: ChainPort;
  readonly persistence: PersistencePort;
  readonly safeData: SafeDataPort;
  readonly simulation: SimulationPort;
  readonly now: () => number;
}

export interface NeutralTransactionAnalysis {
  readonly contract: ContractInsight;
  readonly execution: ExecutionInsight;
  readonly approvalRisk: ApprovalRiskResult;
  readonly storageAnalysis: StorageChangeAnalysis;
  readonly targetRuntimeCode: TargetRuntimeCodeEvidence;
  readonly baselineVerdict: ReturnType<typeof resolveEvidenceVerdict>;
  readonly persisted: AnalysisResult;
}

async function loadImmutableSimulation(
  transaction: SafeTransaction,
  execution: ExecutionInsight,
  persistence: PersistencePort,
): Promise<SimulationOutput | null> {
  if (execution.mode !== "executed-replay" || execution.blockHash === null) {
    return null;
  }

  try {
    const evidence = await persistence.findExecutionEvidence(
      transaction.safe,
      transaction.safeTxHash,
      EXECUTION_EVIDENCE_ENGINE_VERSION,
      execution.blockHash,
    );
    return evidence?.simulation ?? null;
  } catch {
    return null;
  }
}

export interface TargetRuntimeCodeEvidence {
  readonly hash: Hex | null;
  readonly anchor:
    | "transaction-block"
    | "latest"
    | "latest-fallback"
    | "unavailable";
}

async function readRuntimeCodeHash(
  chain: ChainPort,
  transaction: SafeTransaction,
  blockNumber?: bigint,
): Promise<Hex | null> {
  try {
    const code = await chain.getCode(
      transaction.safe.chainId,
      transaction.to,
      blockNumber,
    );
    return code === "0x" ? null : keccak256(code);
  } catch {
    return null;
  }
}

export async function resolveTargetRuntimeCodeEvidence(
  transaction: SafeTransaction,
  chain: ChainPort,
): Promise<TargetRuntimeCodeEvidence> {
  if (transaction.operation !== "delegatecall") {
    return { hash: null, anchor: "unavailable" };
  }

  if (transaction.status === "executed") {
    const historicalHash =
      transaction.blockNumber === null
        ? null
        : await readRuntimeCodeHash(chain, transaction, transaction.blockNumber);
    if (historicalHash) {
      return { hash: historicalHash, anchor: "transaction-block" };
    }

    const latestHash = await readRuntimeCodeHash(chain, transaction);
    return latestHash
      ? { hash: latestHash, anchor: "latest-fallback" }
      : { hash: null, anchor: "unavailable" };
  }

  const latestHash = await readRuntimeCodeHash(chain, transaction);
  return latestHash
    ? { hash: latestHash, anchor: "latest" }
    : { hash: null, anchor: "unavailable" };
}

/**
 * Builds and persists only profile-neutral evidence. Profile Trust and Flag
 * records must be applied separately when a transaction is served.
 */
export async function resolveNeutralTransactionAnalysis(
  transaction: SafeTransaction,
  ports: NeutralTransactionAnalysisPorts,
): Promise<NeutralTransactionAnalysis> {
  const [contract, execution, targetRuntimeCode] = await Promise.all([
    resolveContractInsight(ports.safeData, ports.abi, transaction),
    resolveExecutionInsight(
      ports.simulation,
      transaction,
      { cache: ports.cache, persistence: ports.persistence },
      { chain: ports.chain, safeData: ports.safeData },
    ),
    resolveTargetRuntimeCodeEvidence(transaction, ports.chain),
  ]);
  const [approvalRisk, storageAnalysis] = await Promise.all([
    resolveApprovalRisk(ports.chain, transaction, contract, execution),
    resolveStorageChangeAnalysis(
      ports.abi,
      transaction.safe.chainId,
      execution,
    ),
  ]);
  const baselineVerdict = resolveEvidenceVerdict(
    transaction,
    contract,
    execution,
    [],
    approvalRisk,
    storageAnalysis,
    targetRuntimeCode.hash,
    targetRuntimeCode.anchor,
  );
  const simulation = await loadImmutableSimulation(
    transaction,
    execution,
    ports.persistence,
  );
  const persisted: AnalysisResult = {
    safeTxHash: transaction.safeTxHash,
    engineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
    verdict: baselineVerdict.verdict,
    findings: baselineVerdict.findings,
    simulation,
    createdAt: ports.now(),
    immutable: execution.mode === "executed-replay" && simulation !== null,
  };

  await ports.persistence.saveAnalysis(persisted);

  return {
    contract,
    execution,
    approvalRisk,
    storageAnalysis,
    targetRuntimeCode,
    baselineVerdict,
    persisted,
  };
}
