import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData } from "viem";

import type {
  AbiFunction,
  Address,
  ContractMetadata,
  Hex,
  SafeTransaction,
} from "@/core/domain";
import type { AbiPort, SafeDataPort } from "@/core/ports";
import { resolveContractInsight } from "@/lib/api/contract-insight";

const target = "0x1111111111111111111111111111111111111111" as Address;
const spender = "0x2222222222222222222222222222222222222222" as Address;
const approveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function transaction(): SafeTransaction {
  return {
    safe: {
      chainId: 50,
      address: "0x3333333333333333333333333333333333333333" as Address,
    },
    safeTxHash: `0x${"a".repeat(64)}` as Hex,
    nonce: 1n,
    to: target,
    value: 0n,
    data: encodeFunctionData({
      abi: approveAbi,
      functionName: "approve",
      args: [spender, 50_000n],
    }),
    operation: "call",
    status: "pending",
    confirmations: [],
    proposedAt: 1,
    executedAt: null,
    executedTxHash: null,
    blockNumber: null,
    blockHash: null,
  };
}

describe("resolveContractInsight", () => {
  it("prefers independently verified ABI evidence over a Safe-service decode", async () => {
    const metadata: ContractMetadata = {
      address: target,
      chainId: 50,
      label: "Verified token",
      verified: true,
      abi: approveAbi as unknown as readonly AbiFunction[],
      implementation: null,
      storageLayout: null,
      source: "sourcify",
    };
    const abi = {
      getContractMetadata: vi.fn().mockResolvedValue(metadata),
      resolveImplementationChain: vi.fn().mockResolvedValue([]),
      lookupFunctionSignature: vi.fn(),
    } as unknown as AbiPort;
    const safeData = {
      decodeTransactionData: vi.fn().mockResolvedValue({
        method: "incorrectServiceGuess",
        parameters: [],
        to: target,
        value: "0",
        data: transaction().data,
        operation: "call",
      }),
    } as unknown as SafeDataPort;

    await expect(
      resolveContractInsight(safeData, abi, transaction()),
    ).resolves.toMatchObject({
      provenance: "verified-abi",
      decoded: {
        method: "approve",
        parameters: [
          { name: "spender", value: spender },
          { name: "amount", value: "50000" },
        ],
      },
    });
    expect(abi.lookupFunctionSignature).not.toHaveBeenCalled();
  });
});
