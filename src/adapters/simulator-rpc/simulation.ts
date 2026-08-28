import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  isAddress,
  isHex,
  padHex,
  toHex,
  zeroAddress,
  type Address as ViemAddress,
  type Hex as ViemHex,
  type PublicClient,
  type StateOverride,
} from "viem";

import type {
  Address,
  CallNode,
  CallRequest,
  ChainId,
  Hex,
  LogEntry,
  SimulationOutput,
  StorageChange,
  StorageOverride,
} from "@/core/domain";
import type { SimulationPort } from "@/core/ports";

import { getRpcUrls, getSupportedChain } from "@/adapters/chain-viem/config";

type ClientFactory = (chainId: ChainId) => PublicClient;
type TraceMethod = "debug_traceCall" | "debug_traceTransaction";
type TraceRequester = (
  chainId: ChainId,
  method: TraceMethod,
  params: readonly unknown[],
) => Promise<unknown>;

interface TraceCoverage {
  readonly callTrace: "complete" | "partial" | "unavailable";
  readonly storageDiff: "complete" | "partial" | "unavailable";
}

interface TraceEvidence {
  readonly callTree: CallNode | null;
  readonly storageChanges: readonly StorageChange[];
  readonly coverage: TraceCoverage;
}

const MAX_TRACE_BYTES = 5_000_000;
const MAX_TRACE_DEPTH = 12;
const MAX_TRACE_CALLS = 200;
const MAX_STORAGE_CHANGES = 500;
const ZERO_WORD = ("0x" + "0".repeat(64)) as Hex;

function defaultClient(chainId: ChainId): PublicClient {
  const chain = getSupportedChain(chainId);
  const transports = getRpcUrls(chain).map((url) =>
    http(url, { timeout: 12_000 }),
  );

  return createPublicClient({
    chain,
    transport: fallback(transports, { rank: true, retryCount: 2 }),
  });
}

function traceUrls(chainId: ChainId): readonly string[] {
  return (process.env["TRACE_RPC_URL_" + chainId] ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

async function defaultTraceRequest(
  chainId: ChainId,
  method: TraceMethod,
  params: readonly unknown[],
): Promise<unknown> {
  const urls = traceUrls(chainId);
  if (urls.length === 0) throw new Error("Trace provider is not configured.");

  for (const value of urls) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") continue;

      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;

      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_TRACE_BYTES) {
        continue;
      }

      const text = await response.text();
      if (text.length > MAX_TRACE_BYTES) continue;

      const payload = JSON.parse(text) as {
        readonly error?: unknown;
        readonly result?: unknown;
      };
      if (payload.error !== undefined || payload.result === undefined) continue;
      return payload.result;
    } catch {
      // Try the next server-only URL without exposing provider details.
    }
  }

  throw new Error("Trace provider did not return usable evidence.");
}

function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : "Read-only execution check failed.";
  return message.split("\n")[0]?.slice(0, 240) || "Execution check failed.";
}

function stateOverride(
  overrides: readonly StorageOverride[],
): StateOverride | undefined {
  if (overrides.length === 0) return undefined;

  return overrides.map((override) => ({
    address: override.address as ViemAddress,
    stateDiff: Object.entries(override.slots).map(([slot, value]) => ({
      slot: slot as ViemHex,
      value: value as ViemHex,
    })),
  }));
}

function logEntries(
  logs: readonly {
    readonly address: ViemAddress;
    readonly topics: readonly ViemHex[];
    readonly data: ViemHex;
    readonly logIndex: number | null;
  }[],
): readonly LogEntry[] {
  return logs.map((log, index) => ({
    address: log.address as Address,
    topics: log.topics as readonly Hex[],
    data: log.data as Hex,
    logIndex: log.logIndex ?? index,
  }));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    return null;
  }
  return getAddress(value) as Address;
}

function normalizedHex(value: unknown, fallback: Hex): Hex {
  return typeof value === "string" && isHex(value) ? (value as Hex) : fallback;
}

function normalizedWord(value: unknown): Hex {
  if (typeof value !== "string" || !isHex(value)) return ZERO_WORD;
  try {
    return padHex(value as ViemHex, { size: 32 }) as Hex;
  } catch {
    return ZERO_WORD;
  }
}

function normalizedBigInt(value: unknown): bigint {
  if (typeof value !== "string" || !isHex(value)) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

interface CallTraceState {
  count: number;
  partial: boolean;
}

function normalizeCallNode(
  value: unknown,
  state: CallTraceState,
  depth: number,
  fallbackRoot?: CallNode,
): CallNode | null {
  const raw = record(value);
  if (!raw) return null;

  const from = normalizedAddress(raw.from) ?? fallbackRoot?.from ?? null;
  const to = normalizedAddress(raw.to) ?? fallbackRoot?.to ?? null;
  if (!from || !to) return null;

  state.count += 1;
  const calls: CallNode[] = [];
  const children = Array.isArray(raw.calls) ? raw.calls : [];

  if (depth >= MAX_TRACE_DEPTH && children.length > 0) {
    state.partial = true;
  } else {
    for (const child of children) {
      if (state.count >= MAX_TRACE_CALLS) {
        state.partial = true;
        break;
      }
      const normalized = normalizeCallNode(child, state, depth + 1);
      if (normalized) calls.push(normalized);
    }
  }

  const kind = typeof raw.type === "string" ? raw.type.toUpperCase() : "CALL";
  const error =
    typeof raw.error === "string"
      ? raw.error.slice(0, 240)
      : typeof raw.revertReason === "string"
        ? raw.revertReason.slice(0, 240)
        : null;

  return {
    from,
    to,
    input: normalizedHex(raw.input, "0x"),
    output: raw.output === null ? null : normalizedHex(raw.output, "0x"),
    value: normalizedBigInt(raw.value),
    operation: kind === "DELEGATECALL" ? "delegatecall" : "call",
    reverted: error !== null,
    error,
    calls,
  };
}

function storageMap(value: unknown): Record<string, unknown> {
  const account = record(value);
  const storage = record(account?.storage);
  return storage ?? {};
}

function normalizeStorageChanges(value: unknown): {
  readonly changes: readonly StorageChange[];
  readonly partial: boolean;
} {
  const root = record(value);
  const pre = record(root?.pre) ?? {};
  const post = record(root?.post) ?? {};
  const addresses = new Set([...Object.keys(pre), ...Object.keys(post)]);
  const changes: StorageChange[] = [];
  let partial = false;

  for (const candidate of addresses) {
    const address = normalizedAddress(candidate);
    if (!address) continue;

    const beforeStorage = storageMap(pre[candidate]);
    const afterStorage = storageMap(post[candidate]);
    const slots = new Set([
      ...Object.keys(beforeStorage),
      ...Object.keys(afterStorage),
    ]);

    for (const candidateSlot of slots) {
      if (changes.length >= MAX_STORAGE_CHANGES) {
        partial = true;
        break;
      }

      const slot = normalizedWord(candidateSlot);
      const before = normalizedWord(beforeStorage[candidateSlot]);
      const after = normalizedWord(afterStorage[candidateSlot]);
      if (before === after) continue;
      changes.push({ address, slot, before, after });
    }

    if (partial) break;
  }

  return { changes, partial };
}

function unavailableTrace(): TraceEvidence {
  return {
    callTree: null,
    storageChanges: [],
    coverage: { callTrace: "unavailable", storageDiff: "unavailable" },
  };
}

async function traceEvidence(
  chainId: ChainId,
  method: TraceMethod,
  baseParams: readonly unknown[],
  fallbackRoot: CallNode,
  request: TraceRequester,
): Promise<TraceEvidence> {
  const [callResult, storageResult] = await Promise.allSettled([
    request(chainId, method, [
      ...baseParams,
      { tracer: "callTracer", timeout: "8s" },
    ]),
    request(chainId, method, [
      ...baseParams,
      {
        tracer: "prestateTracer",
        timeout: "8s",
        tracerConfig: { diffMode: true },
      },
    ]),
  ]);

  let callTree: CallNode | null = null;
  let callTrace: TraceCoverage["callTrace"] = "unavailable";
  if (callResult.status === "fulfilled") {
    const state: CallTraceState = { count: 0, partial: false };
    callTree = normalizeCallNode(callResult.value, state, 0, fallbackRoot);
    if (callTree) callTrace = state.partial ? "partial" : "complete";
  }

  let storageChanges: readonly StorageChange[] = [];
  let storageDiff: TraceCoverage["storageDiff"] = "unavailable";
  if (storageResult.status === "fulfilled") {
    const normalized = normalizeStorageChanges(storageResult.value);
    storageChanges = normalized.changes;
    storageDiff = normalized.partial ? "partial" : "complete";
  }

  return {
    callTree,
    storageChanges,
    coverage: { callTrace, storageDiff },
  };
}

function rootCall(request: CallRequest): CallNode {
  return {
    from: request.from ?? (zeroAddress as Address),
    to: request.to,
    input: request.data,
    output: null,
    value: request.value ?? 0n,
    operation: "call",
    reverted: false,
    error: null,
    calls: [],
  };
}

export class RpcSimulationAdapter implements SimulationPort {
  private readonly clients = new Map<ChainId, PublicClient>();

  constructor(
    private readonly createClient: ClientFactory = defaultClient,
    private readonly requestTrace: TraceRequester = defaultTraceRequest,
  ) {}

  async simulate(
    chainId: ChainId,
    request: CallRequest,
    overrides: readonly StorageOverride[],
    blockNumber?: bigint,
  ): Promise<SimulationOutput> {
    const client = this.client(chainId);
    const block = await client.getBlock({ blockNumber });
    if (!block.hash) throw new Error("Simulation block is not finalized.");

    const state = stateOverride(overrides);
    const call = {
      account: request.from as ViemAddress | undefined,
      to: request.to as ViemAddress,
      data: request.data as ViemHex,
      value: request.value,
      blockNumber,
      stateOverride: state,
    } as const;
    const fallbackRoot = rootCall(request);

    try {
      const [result, gasUsed, trace] = await Promise.all([
        client.call(call),
        client.estimateGas(call).catch(() => null),
        overrides.length === 0
          ? traceEvidence(
              chainId,
              "debug_traceCall",
              [
                {
                  from: request.from,
                  to: request.to,
                  data: request.data,
                  value: toHex(request.value ?? 0n),
                },
                blockNumber === undefined ? "latest" : toHex(blockNumber),
              ],
              fallbackRoot,
              this.requestTrace,
            )
          : Promise.resolve(unavailableTrace()),
      ]);

      const callTree = trace.callTree ?? {
        ...fallbackRoot,
        output: (result.data ?? "0x") as Hex,
      };

      return {
        success: true,
        gasUsed,
        callTree,
        logs: [],
        storageChanges: trace.storageChanges,
        blockNumber: block.number,
        blockHash: block.hash,
        error: null,
        traceCoverage: trace.coverage,
      };
    } catch (error) {
      const message = errorMessage(error);
      return {
        success: false,
        gasUsed: null,
        callTree: {
          ...fallbackRoot,
          reverted: true,
          error: message,
        },
        logs: [],
        storageChanges: [],
        blockNumber: block.number,
        blockHash: block.hash,
        error: message,
        traceCoverage: unavailableTrace().coverage,
      };
    }
  }

  async replay(
    chainId: ChainId,
    transactionHash: Hex,
  ): Promise<SimulationOutput> {
    const client = this.client(chainId);
    const [transaction, receipt] = await Promise.all([
      client.getTransaction({ hash: transactionHash as ViemHex }),
      client.getTransactionReceipt({ hash: transactionHash as ViemHex }),
    ]);

    if (
      transaction.blockNumber === null ||
      transaction.blockHash === null ||
      transaction.to === null
    ) {
      throw new Error("Only mined contract calls can be replayed.");
    }

    const success = receipt.status === "success";
    const message = success ? null : "Transaction reverted on-chain.";
    const fallbackRoot: CallNode = {
      from: transaction.from as Address,
      to: transaction.to as Address,
      input: transaction.input as Hex,
      output: null,
      value: transaction.value,
      operation: "call",
      reverted: !success,
      error: message,
      calls: [],
    };
    const trace = await traceEvidence(
      chainId,
      "debug_traceTransaction",
      [transactionHash],
      fallbackRoot,
      this.requestTrace,
    );

    return {
      success,
      gasUsed: receipt.gasUsed,
      callTree: trace.callTree ?? fallbackRoot,
      logs: logEntries(receipt.logs),
      storageChanges: trace.storageChanges,
      blockNumber: transaction.blockNumber,
      blockHash: transaction.blockHash,
      error: message,
      traceCoverage: trace.coverage,
    };
  }

  private client(chainId: ChainId): PublicClient {
    const existing = this.clients.get(chainId);
    if (existing) return existing;

    const client = this.createClient(chainId);
    this.clients.set(chainId, client);
    return client;
  }
}
