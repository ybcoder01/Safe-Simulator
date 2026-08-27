import {
  createPublicClient,
  fallback,
  http,
  zeroAddress,
  type Address as ViemAddress,
  type Hex as ViemHex,
  type PublicClient,
  type StateOverride,
} from "viem";

import type {
  Address,
  CallRequest,
  ChainId,
  Hex,
  LogEntry,
  SimulationOutput,
  StorageOverride,
} from "@/core/domain";
import type { SimulationPort } from "@/core/ports";

import { getRpcUrls, getSupportedChain } from "@/adapters/chain-viem/config";

type ClientFactory = (chainId: ChainId) => PublicClient;

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

export class RpcSimulationAdapter implements SimulationPort {
  private readonly clients = new Map<ChainId, PublicClient>();

  constructor(private readonly createClient: ClientFactory = defaultClient) {}

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

    try {
      const [result, gasUsed] = await Promise.all([
        client.call(call),
        client.estimateGas(call).catch(() => null),
      ]);

      return {
        success: true,
        gasUsed,
        callTree: {
          from: request.from ?? (zeroAddress as Address),
          to: request.to,
          input: request.data,
          output: (result.data ?? "0x") as Hex,
          value: request.value ?? 0n,
          operation: "call",
          reverted: false,
          error: null,
          calls: [],
        },
        logs: [],
        storageChanges: [],
        blockNumber: block.number,
        blockHash: block.hash,
        error: null,
      };
    } catch (error) {
      const message = errorMessage(error);
      return {
        success: false,
        gasUsed: null,
        callTree: {
          from: request.from ?? (zeroAddress as Address),
          to: request.to,
          input: request.data,
          output: null,
          value: request.value ?? 0n,
          operation: "call",
          reverted: true,
          error: message,
          calls: [],
        },
        logs: [],
        storageChanges: [],
        blockNumber: block.number,
        blockHash: block.hash,
        error: message,
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

    return {
      success,
      gasUsed: receipt.gasUsed,
      callTree: {
        from: transaction.from as Address,
        to: transaction.to as Address,
        input: transaction.input as Hex,
        output: null,
        value: transaction.value,
        operation: "call",
        reverted: !success,
        error: message,
        calls: [],
      },
      logs: logEntries(receipt.logs),
      storageChanges: [],
      blockNumber: transaction.blockNumber,
      blockHash: transaction.blockHash,
      error: message,
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
