import {
  createPublicClient,
  fallback,
  http,
  parseAbiItem,
  zeroAddress,
  type Address as ViemAddress,
  type Hex as ViemHex,
  type PublicClient,
} from "viem";

import type {
  Address,
  CallRequest,
  ChainId,
  Hex,
  SafeRef,
  SafeSnapshot,
} from "@/core/domain";
import type { ChainPort } from "@/core/ports";

import { getArchiveRpcUrls, getRpcUrls, getSupportedChain } from "./config";
import { safeReadAbi } from "./safe-abi";

const EIP_1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const SAFE_MODULE_SENTINEL =
  "0x0000000000000000000000000000000000000001" as const;
const EXECUTION_SUCCESS_EVENT = parseAbiItem(
  "event ExecutionSuccess(bytes32 indexed txHash, uint256 payment)",
);
const EXECUTION_FAILURE_EVENT = parseAbiItem(
  "event ExecutionFailure(bytes32 indexed txHash, uint256 payment)",
);
const SAFE_EXECUTION_LOOKBACK_BLOCKS = 50_000n;
const SAFE_EXECUTION_LOG_CHUNK_BLOCKS = 5_000n;

export class ViemChainAdapter implements ChainPort {
  private readonly clients = new Map<ChainId, PublicClient>();
  private readonly archiveClients = new Map<ChainId, PublicClient>();

  private getClient(chainId: ChainId, historical = false): PublicClient {
    const clients = historical ? this.archiveClients : this.clients;
    const existing = clients.get(chainId);
    if (existing) return existing;

    const chain = getSupportedChain(chainId);
    const urls = historical ? getArchiveRpcUrls(chain) : getRpcUrls(chain);
    const hasFallback = urls.length > 1;
    const transports = urls.map((url) =>
      http(url, {
        timeout: hasFallback ? (historical ? 6_000 : 4_000) : 12_000,
      }),
    );
    const client = createPublicClient({
      chain,
      transport: fallback(transports, {
        rank: !historical,
        retryCount: hasFallback ? 0 : historical ? 1 : 2,
      }),
    });
    clients.set(chainId, client);
    return client;
  }

  async getCode(
    chainId: ChainId,
    address: Address,
    blockNumber?: bigint,
  ): Promise<Hex> {
    return (
      (await this.getClient(chainId, blockNumber !== undefined).getCode({
        address: address as ViemAddress,
        blockNumber,
      })) ?? "0x"
    );
  }

  async getStorageAt(
    chainId: ChainId,
    address: Address,
    slot: Hex,
    blockNumber?: bigint,
  ): Promise<Hex> {
    return (
      (await this.getClient(chainId, blockNumber !== undefined).getStorageAt({
        address: address as ViemAddress,
        slot: slot as ViemHex,
        blockNumber,
      })) ?? "0x"
    );
  }

  async getSafeSnapshot(
    safe: SafeRef,
    blockNumber?: bigint,
  ): Promise<SafeSnapshot> {
    const client = this.getClient(safe.chainId, blockNumber !== undefined);
    const contract = {
      address: safe.address as ViemAddress,
      abi: safeReadAbi,
      blockNumber,
    } as const;

    const [owners, threshold, nonce, version] = await Promise.all([
      client.readContract({ ...contract, functionName: "getOwners" }),
      client.readContract({ ...contract, functionName: "getThreshold" }),
      client.readContract({ ...contract, functionName: "nonce" }),
      client
        .readContract({ ...contract, functionName: "VERSION" })
        .catch(() => null),
    ]);

    const [guard, modulePage, implementationSlot] = await Promise.all([
      client
        .readContract({ ...contract, functionName: "getGuard" })
        .catch(() => zeroAddress),
      client
        .readContract({
          ...contract,
          functionName: "getModulesPaginated",
          args: [SAFE_MODULE_SENTINEL, 100n],
        })
        .catch(() => [[], SAFE_MODULE_SENTINEL] as const),
      client
        .getStorageAt({
          address: safe.address as ViemAddress,
          slot: EIP_1967_IMPLEMENTATION_SLOT,
          blockNumber,
        })
        .catch(() => undefined),
    ]);

    const implementation = this.addressFromStorageSlot(implementationSlot);

    return {
      chainId: safe.chainId,
      address: safe.address,
      owners: owners as readonly Address[],
      threshold: Number(threshold),
      nonce,
      version,
      guard: guard === zeroAddress ? null : (guard as Address),
      modules: modulePage[0] as readonly Address[],
      implementation,
      observedAt: Math.floor(Date.now() / 1_000),
    };
  }

  async call(
    chainId: ChainId,
    request: CallRequest,
    blockNumber?: bigint,
  ): Promise<Hex> {
    return this.getClient(chainId, blockNumber !== undefined)
      .call({
        account: request.from as ViemAddress | undefined,
        to: request.to as ViemAddress,
        data: request.data as ViemHex,
        value: request.value,
        blockNumber,
      })
      .then((result) => result.data ?? "0x");
  }

  async getBlockHash(chainId: ChainId, blockNumber: bigint): Promise<Hex> {
    const block = await this.getClient(chainId).getBlock({ blockNumber });
    return block.hash;
  }

  async findSafeExecution(safe: SafeRef, safeTxHash: Hex) {
    const client = this.getClient(safe.chainId);
    const latest = await client.getBlockNumber();
    const earliest =
      latest > SAFE_EXECUTION_LOOKBACK_BLOCKS
        ? latest - SAFE_EXECUTION_LOOKBACK_BLOCKS
        : 0n;

    for (
      let toBlock = latest;
      toBlock >= earliest;
      toBlock -= SAFE_EXECUTION_LOG_CHUNK_BLOCKS
    ) {
      const fromBlock =
        toBlock - earliest >= SAFE_EXECUTION_LOG_CHUNK_BLOCKS
          ? toBlock - SAFE_EXECUTION_LOG_CHUNK_BLOCKS + 1n
          : earliest;
      const query = async (
        event:
          | typeof EXECUTION_SUCCESS_EVENT
          | typeof EXECUTION_FAILURE_EVENT,
        status: "executed" | "failed",
      ) => {
        const logs = await client.getLogs({
          address: safe.address as ViemAddress,
          event: event as typeof EXECUTION_SUCCESS_EVENT,
          args: { txHash: safeTxHash as ViemHex },
          fromBlock,
          toBlock,
          strict: true,
        });
        const log = logs.at(-1);
        if (!log?.transactionHash || !log.blockNumber || !log.blockHash) {
          return null;
        }
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        return {
          status,
          transactionHash: log.transactionHash as Hex,
          blockNumber: log.blockNumber,
          blockHash: log.blockHash as Hex,
          executedAt: Number(block.timestamp),
        } as const;
      };

      const success = await query(EXECUTION_SUCCESS_EVENT, "executed");
      if (success) return success;
      const failure = await query(EXECUTION_FAILURE_EVENT, "failed");
      if (failure) return failure;
      if (fromBlock === earliest) break;
    }
    return null;
  }

  async getTransactionBlock(
    chainId: ChainId,
    transactionHash: Hex,
  ): Promise<{ blockNumber: bigint; blockHash: Hex }> {
    const transaction = await this.getClient(chainId).getTransaction({
      hash: transactionHash as ViemHex,
    });
    if (transaction.blockNumber === null || transaction.blockHash === null) {
      throw new Error(
        `Transaction ${transactionHash} is not included in a block.`,
      );
    }
    return {
      blockNumber: transaction.blockNumber,
      blockHash: transaction.blockHash,
    };
  }

  private addressFromStorageSlot(slot: Hex | undefined): Address | null {
    if (!slot || BigInt(slot) === 0n) return null;
    return `0x${slot.slice(-40)}` as Address;
  }
}
