export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type ChainId = number;
export type UnixTime = number;

export interface SafeRef {
  readonly chainId: ChainId;
  readonly address: Address;
}

export interface SafeSnapshot extends SafeRef {
  readonly owners: readonly Address[];
  readonly threshold: number;
  readonly nonce: bigint;
  readonly version: string | null;
  readonly guard: Address | null;
  readonly modules: readonly Address[];
  readonly implementation: Address | null;
  readonly observedAt: UnixTime;
}

export type Operation = "call" | "delegatecall";
export type TransactionStatus = "pending" | "executed" | "failed" | "replaced";

export interface Confirmation {
  readonly owner: Address;
  readonly signature: Hex;
  readonly signedAt: UnixTime | null;
}

export interface SafeTransaction {
  readonly safe: SafeRef;
  readonly safeTxHash: Hex;
  readonly nonce: bigint;
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly operation: Operation;
  readonly status: TransactionStatus;
  readonly confirmations: readonly Confirmation[];
  readonly proposedAt: UnixTime;
  readonly executedAt: UnixTime | null;
  readonly executedTxHash: Hex | null;
  readonly blockNumber: bigint | null;
  readonly blockHash: Hex | null;
}

export interface ModuleTransaction {
  readonly safe: SafeRef;
  readonly module: Address;
  readonly transactionHash: Hex;
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
  readonly operation: Operation;
  readonly blockNumber: bigint;
  readonly executedAt: UnixTime;
}

export interface TransferRecord {
  readonly safe: SafeRef;
  readonly transactionHash: Hex;
  readonly token: Address | null;
  readonly from: Address;
  readonly to: Address;
  readonly amount: bigint;
  readonly blockNumber: bigint;
  readonly timestamp: UnixTime;
}

export interface SafeMessage {
  readonly safe: SafeRef;
  readonly messageHash: Hex;
  readonly payload: Hex | string;
  readonly confirmations: readonly Confirmation[];
  readonly createdAt: UnixTime;
}

export interface TokenBalance {
  readonly token: Address | null;
  readonly amount: bigint;
  readonly decimals: number;
  readonly symbol: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly total: number | null;
}

export interface CallRequest {
  readonly from?: Address;
  readonly to: Address;
  readonly data: Hex;
  readonly value?: bigint;
}

export interface StorageOverride {
  readonly address: Address;
  readonly slots: Readonly<Record<Hex, Hex>>;
}

export interface CallNode {
  readonly from: Address;
  readonly to: Address;
  readonly input: Hex;
  readonly output: Hex | null;
  readonly value: bigint;
  readonly operation: Operation;
  readonly reverted: boolean;
  readonly error: string | null;
  readonly calls: readonly CallNode[];
}

export interface LogEntry {
  readonly address: Address;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly logIndex: number;
}

export interface StorageChange {
  readonly address: Address;
  readonly slot: Hex;
  readonly before: Hex;
  readonly after: Hex;
}

export interface SimulationOutput {
  readonly success: boolean;
  readonly gasUsed: bigint | null;
  readonly callTree: CallNode;
  readonly logs: readonly LogEntry[];
  readonly storageChanges: readonly StorageChange[];
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly error: string | null;
}

export interface AbiParameter {
  readonly name: string;
  readonly type: string;
  readonly components?: readonly AbiParameter[];
}

export interface AbiFunction {
  readonly type: "function";
  readonly name: string;
  readonly stateMutability: "pure" | "view" | "nonpayable" | "payable";
  readonly inputs: readonly AbiParameter[];
  readonly outputs: readonly AbiParameter[];
}

export interface ContractMetadata {
  readonly address: Address;
  readonly chainId: ChainId;
  readonly label: string | null;
  readonly verified: boolean;
  readonly abi: readonly AbiFunction[] | null;
  readonly implementation: Address | null;
  readonly storageLayout: StorageLayout | null;
  readonly source:
    | "sourcify"
    | "explorer"
    | "fourbyte"
    | "registry"
    | "unknown";
}

export interface StorageLayout {
  readonly slots: readonly {
    readonly slot: Hex;
    readonly label: string;
    readonly type: string;
  }[];
}

export type Verdict = "trusted" | "known" | "unverified" | "flagged";
export type FindingSeverity = "info" | "warning" | "critical";

export interface Finding {
  readonly code: string;
  readonly severity: FindingSeverity;
  readonly title: string;
  readonly detail: string;
  readonly addresses: readonly Address[];
}

export interface AnalysisResult {
  readonly safeTxHash: Hex;
  readonly engineVersion: string;
  readonly verdict: Verdict;
  readonly findings: readonly Finding[];
  readonly simulation: SimulationOutput | null;
  readonly createdAt: UnixTime;
  readonly immutable: boolean;
}

export interface SyncCursor {
  readonly safe: SafeRef;
  readonly stream: "multisig" | "module" | "transfer" | "message";
  readonly cursor: string | null;
  readonly status: "idle" | "running" | "complete" | "failed";
  readonly updatedAt: UnixTime;
}

export type QueueJob =
  | { readonly type: "sync-sweep"; readonly cursor: string | null }
  | {
      readonly type: "backfill";
      readonly safe: SafeRef;
      readonly stream: SyncCursor["stream"];
    }
  | { readonly type: "incremental-sync"; readonly safe: SafeRef }
  | {
      readonly type: "analyze";
      readonly safe: SafeRef;
      readonly safeTxHash: Hex;
    }
  | {
      readonly type: "reanalyze";
      readonly safe: SafeRef;
      readonly engineVersion: string;
    };
