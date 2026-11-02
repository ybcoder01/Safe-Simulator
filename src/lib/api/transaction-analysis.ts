import type {
  Address,
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
  resolveInternalProxyBoundaries,
  type InternalProxyBoundary,
} from "@/lib/api/internal-proxy-boundaries";
import {
  resolveProtocolRouteAttestation,
  type ProtocolRouteAttestation,
} from "@/lib/api/protocol-route-attestation";
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
  readonly internalProxyBoundaries: readonly InternalProxyBoundary[];
  readonly routeAttestation: ProtocolRouteAttestation;
  readonly baselineVerdict: ReturnType<typeof resolveEvidenceVerdict>;
  readonly persisted: AnalysisResult;
}

interface CachedNeutralTransactionAnalysis
  extends Omit<NeutralTransactionAnalysis, "persisted"> {
  readonly engineVersion: string;
  readonly blockHash: Hex;
}

function neutralAnalysisCacheKey(transaction: SafeTransaction) {
  if (transaction.status !== "executed" || transaction.blockHash === null) {
    return null;
  }

  return [
    "neutral-transaction-analysis",
    TRANSACTION_ANALYSIS_ENGINE_VERSION,
    transaction.safe.chainId,
    transaction.safeTxHash.toLowerCase(),
    transaction.blockHash.toLowerCase(),
  ].join(":");
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
  readonly accountType: "contract" | "wallet" | "unavailable";
  readonly anchor:
    | "transaction-block"
    | "latest"
    | "latest-fallback"
    | "unavailable";
}

async function readRuntimeCode(
  chain: ChainPort,
  transaction: SafeTransaction,
  blockNumber?: bigint,
): Promise<Pick<TargetRuntimeCodeEvidence, "accountType" | "hash"> | null> {
  try {
    const code = await chain.getCode(
      transaction.safe.chainId,
      transaction.to,
      blockNumber,
    );
    return code === "0x"
      ? { accountType: "wallet", hash: null }
      : { accountType: "contract", hash: keccak256(code) };
  } catch {
    return null;
  }
}

export async function resolveTargetRuntimeCodeEvidence(
  transaction: SafeTransaction,
  chain: ChainPort,
): Promise<TargetRuntimeCodeEvidence> {
  if (transaction.status === "executed") {
    const historicalCode =
      transaction.blockNumber === null
        ? null
        : await readRuntimeCode(chain, transaction, transaction.blockNumber);
    if (historicalCode) {
      return { ...historicalCode, anchor: "transaction-block" };
    }

    const latestCode = await readRuntimeCode(chain, transaction);
    return latestCode
      ? { ...latestCode, anchor: "latest-fallback" }
      : { accountType: "unavailable", hash: null, anchor: "unavailable" };
  }

  const latestCode = await readRuntimeCode(chain, transaction);
  return latestCode
    ? { ...latestCode, anchor: "latest" }
    : { accountType: "unavailable", hash: null, anchor: "unavailable" };
}

/**
 * Builds and persists only profile-neutral evidence. Profile Trust and Flag
 * records must be applied separately when a transaction is served.
 */
export async function resolveNeutralTransactionAnalysis(
  transaction: SafeTransaction,
  ports: NeutralTransactionAnalysisPorts,
): Promise<NeutralTransactionAnalysis> {
  const cacheKey = neutralAnalysisCacheKey(transaction);
  if (cacheKey && transaction.blockHash) {
    try {
      const cached =
        await ports.cache.get<CachedNeutralTransactionAnalysis>(cacheKey);
      if (
        cached?.engineVersion === TRANSACTION_ANALYSIS_ENGINE_VERSION &&
        cached.blockHash.toLowerCase() === transaction.blockHash.toLowerCase()
      ) {
        const persisted = await ports.persistence.findAnalysis(
          transaction.safeTxHash,
          TRANSACTION_ANALYSIS_ENGINE_VERSION,
        );
        if (persisted) return { ...cached, persisted };
      }
    } catch {
      // Cache availability must never decide whether analysis can proceed.
    }
  }

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
  const [approvalRisk, storageAnalysis, internalProxyBoundaries] =
    await Promise.all([
      resolveApprovalRisk(ports.chain, transaction, contract, execution),
      resolveStorageChangeAnalysis(
        ports.abi,
        transaction.safe.chainId,
        execution,
      ),
      resolveInternalProxyBoundaries(
        ports.abi,
        transaction.safe.chainId,
        execution.internalCalls,
        [
          transaction.safe.address,
          transaction.to,
          ...contract.implementationChain.map((address) => address as Address),
        ],
        transaction.blockNumber ?? undefined,
      ),
    ]);
  const routeAttestation = await resolveProtocolRouteAttestation(
    ports.chain,
    transaction,
    execution,
    internalProxyBoundaries,
  );
  const baselineVerdict = resolveEvidenceVerdict(
    transaction,
    contract,
    execution,
    [],
    approvalRisk,
    storageAnalysis,
    targetRuntimeCode.hash,
    targetRuntimeCode.anchor,
    internalProxyBoundaries,
    targetRuntimeCode.accountType,
    routeAttestation,
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

  const neutral = {
    contract,
    execution,
    approvalRisk,
    storageAnalysis,
    targetRuntimeCode,
    internalProxyBoundaries,
    routeAttestation,
    baselineVerdict,
  };
  if (cacheKey && transaction.blockHash) {
    try {
      await ports.cache.set<CachedNeutralTransactionAnalysis>(
        cacheKey,
        {
          ...neutral,
          engineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
          blockHash: transaction.blockHash,
        },
        null,
      );
    } catch {
      // The persisted result remains authoritative if Redis is unavailable.
    }
  }

  return {
    ...neutral,
    persisted,
  };
}
