import {
  createPublicClient,
  fallback,
  http,
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

import { getRpcUrls, getSupportedChain } from "./config";
import { safeReadAbi } from "./safe-abi";

const EIP_1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const SAFE_MODULE_SENTINEL =
  "0x0000000000000000000000000000000000000001" as const;

export class ViemChainAdapter implements ChainPort {
  private readonly clients = new Map<ChainId, PublicClient>();

  private getClient(chainId: ChainId): PublicClient {
    const existing = this.clients.get(chainId);
    if (existing) return existing;

    const chain = getSupportedChain(chainId);
    const transports = getRpcUrls(chain).map((url) =>
      http(url, { timeout: 12_000 }),
    );
    const client = createPublicClient({
      chain,
      transport: fallback(transports, { rank: true, retryCount: 2 }),
    });
    this.clients.set(chainId, client);
    return client;
  }

  async getCode(
    chainId: ChainId,
    address: Address,
    blockNumber?: bigint,
  ): Promise<Hex> {
    return (
      (await this.getClient(chainId).getCode({
        address: address as ViemAddress,
        blockNumber,
      })) ?? "0x"
    );
  }

  async getSafeSnapshot(
    safe: SafeRef,
    blockNumber?: bigint,
  ): Promise<SafeSnapshot> {
    const client = this.getClient(safe.chainId);
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
    return this.getClient(chainId)
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
