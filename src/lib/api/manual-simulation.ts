import { getAddress, keccak256, stringToHex } from "viem";
import { z } from "zod";

import type {
  Address,
  AddressBookEntry,
  Hex,
  SafeSnapshot,
  SafeTransaction,
} from "@/core/domain";
import type {
  AbiPort,
  ChainPort,
  SafeDataPort,
  SimulationPort,
} from "@/core/ports";
import { resolveApprovalRisk } from "@/lib/api/approval-risk";
import { resolveContractInsight } from "@/lib/api/contract-insight";
import { resolveEvidenceVerdict } from "@/lib/api/evidence-verdict";
import {
  executionInsightFromTargetCall,
  type ExecutionInsight,
} from "@/lib/api/execution-insight";
import { resolveInternalProxyBoundaries } from "@/lib/api/internal-proxy-boundaries";
import { resolveStorageChangeAnalysis } from "@/lib/api/storage-changes";

const MAX_CALLDATA_HEX_CHARACTERS = 65_536;
const UINT256_MAX = (1n << 256n) - 1n;

export const manualSimulationInputSchema = z.object({
  to: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 20-byte target address.")
    .transform((value) => getAddress(value) as Address),
  value: z
    .string()
    .regex(/^\d+$/, "Value must be a non-negative integer in wei.")
    .refine((value) => BigInt(value) <= UINT256_MAX, "Value exceeds uint256."),
  data: z
    .string()
    .regex(
      /^0x(?:[0-9a-fA-F]{2})*$/,
      "Calldata must be even-length hexadecimal beginning with 0x.",
    )
    .max(
      MAX_CALLDATA_HEX_CHARACTERS + 2,
      "Calldata exceeds the 32 KiB preview limit.",
    )
    .transform((value) => value.toLowerCase() as Hex),
});

export type ManualSimulationInput = z.infer<typeof manualSimulationInputSchema>;

export interface ManualSimulationPorts {
  readonly abi: AbiPort;
  readonly chain: ChainPort;
  readonly safeData: SafeDataPort;
  readonly simulation: SimulationPort;
}

export interface ManualSimulationView {
  readonly request: {
    readonly safe: Address;
    readonly to: Address;
    readonly value: string;
    readonly data: Hex;
  };
  readonly target: {
    readonly label: string | null;
    readonly verified: boolean;
    readonly source: string;
    readonly implementationChain: readonly string[];
  };
  readonly decoded: {
    readonly method: string;
    readonly provenance: string;
    readonly signature: string | null;
    readonly parameters: readonly {
      readonly name: string;
      readonly type: string;
      readonly value: string;
    }[];
  } | null;
  readonly execution: {
    readonly success: boolean | null;
    readonly error: string | null;
    readonly gasUsed: string | null;
    readonly blockNumber: string | null;
    readonly blockHash: Hex | null;
    readonly internalCallCount: number;
    readonly delegateCallCount: number;
    readonly storageChangeCount: number;
    readonly namedStorageChangeCount: number;
    readonly coverage: ExecutionInsight["coverage"];
    readonly warnings: readonly string[];
  };
  readonly approvals: readonly {
    readonly method: string;
    readonly standard: string;
    readonly token: Address | null;
    readonly spender: Address | null;
    readonly amount: string | null;
    readonly infinite: boolean | null;
    readonly priorAmount: string | null;
    readonly newSpenderAtAnchor: boolean | null;
    readonly warning: string | null;
  }[];
  readonly verdict: ReturnType<typeof resolveEvidenceVerdict>;
}

function draftTransaction(
  safe: SafeSnapshot,
  input: ManualSimulationInput,
): SafeTransaction {
  const fingerprint = JSON.stringify({
    chainId: safe.chainId,
    safe: safe.address.toLowerCase(),
    nonce: safe.nonce.toString(),
    to: input.to.toLowerCase(),
    value: input.value,
    data: input.data,
  });

  return {
    safe: { chainId: safe.chainId, address: safe.address },
    safeTxHash: keccak256(stringToHex(fingerprint)),
    nonce: safe.nonce,
    to: input.to,
    value: BigInt(input.value),
    data: input.data,
    operation: "call",
    status: "pending",
    confirmations: [],
    proposedAt: Math.floor(Date.now() / 1_000),
    executedAt: null,
    executedTxHash: null,
    blockNumber: null,
    blockHash: null,
  };
}

export async function resolveManualSimulation(
  safe: SafeSnapshot,
  input: ManualSimulationInput,
  addressBook: readonly AddressBookEntry[],
  ports: ManualSimulationPorts,
): Promise<ManualSimulationView> {
  const transaction = draftTransaction(safe, input);
  const [contract, output] = await Promise.all([
    resolveContractInsight(ports.safeData, ports.abi, transaction),
    ports.simulation.simulate(
      safe.chainId,
      {
        from: safe.address,
        to: input.to,
        value: BigInt(input.value),
        data: input.data,
      },
      [],
    ),
  ]);
  const execution = executionInsightFromTargetCall(output, safe.address);
  const [approvals, storage, internalProxyBoundaries] = await Promise.all([
    resolveApprovalRisk(ports.chain, transaction, contract, execution),
    resolveStorageChangeAnalysis(ports.abi, safe.chainId, execution),
    resolveInternalProxyBoundaries(
      ports.abi,
      safe.chainId,
      execution.internalCalls,
      [
        safe.address,
        transaction.to,
        ...contract.implementationChain.map((address) => address as Address),
      ],
    ),
  ]);
  const verdict = resolveEvidenceVerdict(
    transaction,
    contract,
    execution,
    addressBook,
    approvals,
    storage,
    null,
    "unavailable",
    internalProxyBoundaries,
  );

  return {
    request: {
      safe: safe.address,
      to: input.to,
      value: input.value,
      data: input.data,
    },
    target: {
      label: contract.metadata.label,
      verified: contract.metadata.verified,
      source: contract.metadata.source,
      implementationChain: contract.implementationChain,
    },
    decoded: contract.decoded
      ? {
          method: contract.decoded.method,
          provenance: contract.provenance,
          signature: contract.signature,
          parameters: contract.decoded.parameters.map((parameter) => ({
            name: parameter.name,
            type: parameter.type,
            value: parameter.value,
          })),
        }
      : null,
    execution: {
      success: execution.success,
      error: execution.error,
      gasUsed: execution.gasUsed,
      blockNumber: execution.blockNumber,
      blockHash: execution.blockHash,
      internalCallCount: execution.internalCalls.length,
      delegateCallCount: execution.internalCalls.filter(
        (call) => call.operation === "delegatecall",
      ).length,
      storageChangeCount: storage.items.length,
      namedStorageChangeCount: storage.namedCount,
      coverage: execution.coverage,
      warnings: [
        ...execution.warnings,
        ...storage.warnings,
        ...approvals.warnings,
      ],
    },
    approvals: approvals.requests.map((approval) => ({
      method: approval.method,
      standard: approval.standard,
      token: approval.token,
      spender: approval.spender,
      amount: approval.resultingAmount ?? approval.amount,
      infinite: approval.infinite,
      priorAmount: approval.priorAmount,
      newSpenderAtAnchor: approval.newSpenderAtAnchor,
      warning: approval.warning,
    })),
    verdict,
  };
}
