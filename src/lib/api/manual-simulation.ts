import { getAddress, keccak256, stringToHex } from "viem";
import { z } from "zod";

import {
  findContractRegistryEntry,
  type ContractRegistryEntry,
} from "@/core/analysis/trust/contract-registry";
import { findTokenRegistryEntry } from "@/core/analysis/trust/token-registry";
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
import { resolveProtocolRouteAttestation } from "@/lib/api/protocol-route-attestation";
import { resolveStorageChangeAnalysis } from "@/lib/api/storage-changes";
import { PROTOCOL_LABELS } from "@/lib/protocol-directory";

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
  readonly protocols: readonly {
    readonly key: string;
    readonly label: string;
    readonly reviewed: boolean;
    readonly contracts: readonly {
      readonly address: Address;
      readonly label: string;
      readonly role: string;
    }[];
  }[];
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
    readonly tokenLabel: string | null;
    readonly spender: Address | null;
    readonly spenderLabel: string | null;
    readonly spenderProtocol: string | null;
    readonly spenderReviewed: boolean;
    readonly amount: string | null;
    readonly infinite: boolean | null;
    readonly priorAmount: string | null;
    readonly newSpenderAtAnchor: boolean | null;
    readonly warning: string | null;
  }[];
  readonly verdict: ReturnType<typeof resolveEvidenceVerdict>;
}

function protocolLabel(entry: ContractRegistryEntry | null): string | null {
  if (!entry || entry.category !== "protocol") return null;
  return PROTOCOL_LABELS[entry.protocol] ?? entry.protocol;
}

function protocolIdentities(
  chainId: SafeSnapshot["chainId"],
  addresses: readonly Address[],
): ManualSimulationView["protocols"] {
  const groups = new Map<
    string,
    {
      label: string;
      reviewed: boolean;
      contracts: Map<string, ContractRegistryEntry>;
    }
  >();

  for (const address of addresses) {
    const entry = findContractRegistryEntry(chainId, address);
    if (
      !entry ||
      entry.category !== "protocol" ||
      entry.lifecycle !== "active"
    ) {
      continue;
    }

    const group = groups.get(entry.protocol) ?? {
      label: PROTOCOL_LABELS[entry.protocol] ?? entry.protocol,
      reviewed: false,
      contracts: new Map<string, ContractRegistryEntry>(),
    };
    group.reviewed ||= entry.trustPolicy === "protocol-whitelist";
    group.contracts.set(entry.address.toLowerCase(), entry);
    groups.set(entry.protocol, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      label: group.label,
      reviewed: group.reviewed,
      contracts: [...group.contracts.values()].map((entry) => ({
        address: entry.address,
        label: entry.label,
        role: entry.role,
      })),
    }))
    .sort(
      (left, right) =>
        Number(right.reviewed) - Number(left.reviewed) ||
        left.label.localeCompare(right.label),
    );
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
  const routeAttestation = await resolveProtocolRouteAttestation(
    ports.chain,
    transaction,
    execution,
    internalProxyBoundaries,
  );
  const participantAddresses = [
    transaction.to,
    ...approvals.requests.flatMap((approval) =>
      [approval.token, approval.spender].filter(
        (address): address is Address => address !== null,
      ),
    ),
    ...execution.internalCalls.map((call) => call.to as Address),
  ];
  const protocols = protocolIdentities(safe.chainId, participantAddresses);
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
    "contract",
    routeAttestation,
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
    protocols,
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
    approvals: approvals.requests.map((approval) => {
      const tokenEntry = approval.token
        ? findContractRegistryEntry(safe.chainId, approval.token)
        : null;
      const tokenIdentity = approval.token
        ? findTokenRegistryEntry(safe.chainId, approval.token)
        : null;
      const spenderEntry = approval.spender
        ? findContractRegistryEntry(safe.chainId, approval.spender)
        : null;
      return {
        method: approval.method,
        standard: approval.standard,
        token: approval.token,
        tokenLabel: tokenIdentity?.name ?? tokenEntry?.label ?? null,
        spender: approval.spender,
        spenderLabel: spenderEntry?.label ?? null,
        spenderProtocol: protocolLabel(spenderEntry),
        spenderReviewed:
          spenderEntry?.trustPolicy === "protocol-whitelist" &&
          spenderEntry.lifecycle === "active",
        amount: approval.resultingAmount ?? approval.amount,
        infinite: approval.infinite,
        priorAmount: approval.priorAmount,
        newSpenderAtAnchor: approval.newSpenderAtAnchor,
        warning: approval.warning,
      };
    }),
    verdict,
  };
}
