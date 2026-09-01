import type {
  Address,
  AddressBookEntry,
  AnalysisResult,
  CallRequest,
  ChainId,
  ContractMetadata,
  ExecutionEvidenceRecord,
  DecodedCall,
  Hex,
  ModuleAnalysisResult,
  ModuleTransaction,
  Page,
  QueueJob,
  SafeExecutionPayload,
  SafeMessage,
  SafeRef,
  SafeSnapshot,
  SafeTransaction,
  SimulationOutput,
  StorageOverride,
  SyncCursor,
  TokenBalance,
  TransferRecord,
} from "./domain";

export interface SafeDataPort {
  /** Discovers public Safes associated with an owner on one chain. Never requests a signature. */
  discoverSafesByOwner(
    chainId: ChainId,
    owner: Address,
  ): Promise<readonly SafeRef[]>;
  /** Returns one normalized page and an opaque cursor suitable for exact resumption. */
  listMultisigTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeTransaction>>;
  /** Returns the complete service-authored Safe execution payload for signature-valid simulation. */
  getMultisigTransaction(
    safe: SafeRef,
    safeTxHash: Hex,
  ): Promise<SafeExecutionPayload | null>;
  listModuleTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<ModuleTransaction>>;
  listTransfers(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<TransferRecord>>;
  listMessages(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeMessage>>;
  /** Balances are an ephemeral projection and must not be used as historical truth. */
  getBalances(safe: SafeRef): Promise<readonly TokenBalance[]>;
  /** Best-effort, read-only calldata decoding. A null result keeps raw calldata explicit. */
  decodeTransactionData(
    safe: SafeRef,
    to: Address,
    data: Hex,
  ): Promise<DecodedCall | null>;
}

export interface ChainPort {
  /** Returns deployed bytecode at the requested block, or 0x for an EOA/nonexistent account. */
  getCode(
    chainId: ChainId,
    address: Address,
    blockNumber?: bigint,
  ): Promise<Hex>;
  /** Reads one storage slot without modifying chain state. */
  getStorageAt(
    chainId: ChainId,
    address: Address,
    slot: Hex,
    blockNumber?: bigint,
  ): Promise<Hex>;
  /** Reads the canonical Safe configuration using eth_call only. */
  getSafeSnapshot(safe: SafeRef, blockNumber?: bigint): Promise<SafeSnapshot>;
  /** Performs a read-only contract call. Implementations must never hold or accept signing keys. */
  call(
    chainId: ChainId,
    request: CallRequest,
    blockNumber?: bigint,
  ): Promise<Hex>;
  getBlockHash(chainId: ChainId, blockNumber: bigint): Promise<Hex>;
  getTransactionBlock(
    chainId: ChainId,
    transactionHash: Hex,
  ): Promise<{ blockNumber: bigint; blockHash: Hex }>;
}

export interface SimulationPort {
  /** Simulates without broadcasting and returns normalized trace, logs, and storage differences. */
  simulate(
    chainId: ChainId,
    request: CallRequest,
    overrides: readonly StorageOverride[],
    blockNumber?: bigint,
  ): Promise<SimulationOutput>;
  /** Replays an executed transaction at its original block/index for immutable ground truth. */
  replay(chainId: ChainId, transactionHash: Hex): Promise<SimulationOutput>;
}

export interface AbiPort {
  /** Resolves verified metadata through the configured cascade; unknown data is returned explicitly. */
  getContractMetadata(
    chainId: ChainId,
    address: Address,
  ): Promise<ContractMetadata>;
  /** Resolves proxy and implementation chains with cycle detection. */
  resolveImplementationChain(
    chainId: ChainId,
    address: Address,
  ): Promise<readonly Address[]>;
  /** Best-effort selector lookup. A null result means calldata must remain raw. */
  lookupFunctionSignature(selector: Hex): Promise<string | null>;
}

export interface PersistencePort {
  upsertSafe(snapshot: SafeSnapshot): Promise<void>;
  findSafe(ref: SafeRef): Promise<SafeSnapshot | null>;
  listSafesForProfile(profileId: string): Promise<readonly SafeSnapshot[]>;
  /** Lists all persisted Safes for bounded background sweeps. The cursor is opaque to callers. */
  listSafes(cursor: string | null, limit: number): Promise<Page<SafeSnapshot>>;
  bookmarkSafe(profileId: string, safe: SafeRef): Promise<void>;
  unbookmarkSafe(profileId: string, safe: SafeRef): Promise<void>;
  listAddressBookEntries(
    profileId: string,
    safe: SafeRef,
  ): Promise<readonly AddressBookEntry[]>;
  upsertTransactions(items: readonly SafeTransaction[]): Promise<void>;
  upsertModuleTransactions(items: readonly ModuleTransaction[]): Promise<void>;
  listModuleTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<ModuleTransaction>>;
  findModuleTransaction(
    safe: SafeRef,
    transactionHash: Hex,
  ): Promise<ModuleTransaction | null>;
  saveModuleAnalysis(result: ModuleAnalysisResult): Promise<void>;
  findModuleAnalysis(
    transactionHash: Hex,
    engineVersion: string,
  ): Promise<ModuleAnalysisResult | null>;
  findModuleAnalyses(
    safe: SafeRef,
    transactionHashes: readonly Hex[],
    engineVersion: string,
  ): Promise<readonly ModuleAnalysisResult[]>;
  upsertTransfers(items: readonly TransferRecord[]): Promise<void>;
  listTransfers(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<TransferRecord>>;
  upsertMessages(items: readonly SafeMessage[]): Promise<void>;
  listMessages(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeMessage>>;
  findMessage(safe: SafeRef, messageHash: Hex): Promise<SafeMessage | null>;
  listTransactions(
    safe: SafeRef,
    cursor: string | null,
    limit: number,
  ): Promise<Page<SafeTransaction>>;
  findTransaction(
    safe: SafeRef,
    safeTxHash: Hex,
  ): Promise<SafeTransaction | null>;
  saveExecutionEvidence(result: ExecutionEvidenceRecord): Promise<void>;
  findExecutionEvidence(
    safe: SafeRef,
    safeTxHash: Hex,
    engineVersion: string,
    blockHash: Hex,
  ): Promise<ExecutionEvidenceRecord | null>;
  saveAnalysis(result: AnalysisResult): Promise<void>;
  findAnalysis(
    safeTxHash: Hex,
    engineVersion: string,
  ): Promise<AnalysisResult | null>;
  findAnalyses(
    safe: SafeRef,
    safeTxHashes: readonly Hex[],
    engineVersion: string,
  ): Promise<readonly AnalysisResult[]>;
  getAnalysisCoverage(
    safe: SafeRef,
    engineVersion: string,
  ): Promise<{
    readonly analyzedTransactions: number;
    readonly totalTransactions: number;
  }>;
  saveSyncCursor(cursor: SyncCursor): Promise<void>;
  findSyncCursor(
    safe: SafeRef,
    stream: SyncCursor["stream"],
  ): Promise<SyncCursor | null>;
  upsertContract(metadata: ContractMetadata): Promise<void>;
  setAddressBookEntry(
    profileId: string,
    safe: SafeRef,
    address: Address,
    label: string,
    trust: "trusted" | "flagged",
  ): Promise<void>;
  removeAddressBookEntry(
    profileId: string,
    safe: SafeRef,
    address: Address,
  ): Promise<void>;
}

export interface CachePort {
  get<T>(key: string): Promise<T | null>;
  /** A null TTL means the value is immutable and may be retained indefinitely. */
  set<T>(key: string, value: T, ttlSeconds: number | null): Promise<void>;
  delete(key: string): Promise<void>;
  deleteByPrefix(prefix: string): Promise<number>;
}

export interface ReadinessPort {
  checkDatabase(): Promise<void>;
  checkCache(): Promise<void>;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimitPort {
  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitDecision>;
}

export interface QueuePort {
  /** Enqueues an idempotent job. Reusing idempotencyKey must not create duplicate work. */
  enqueue(
    job: QueueJob,
    options: { idempotencyKey: string; delaySeconds?: number },
  ): Promise<{ jobId: string }>;
}
