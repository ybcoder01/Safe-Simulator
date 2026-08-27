import {
  decodeFunctionData,
  parseAbiItem,
  type Abi,
  type AbiFunction as ViemAbiFunction,
} from "viem";

import type {
  AbiFunction,
  DecodedCall,
  DecodedParameter,
  SafeTransaction,
} from "@/core/domain";
import type { AbiPort, SafeDataPort } from "@/core/ports";
import { resolveDecodedCall } from "@/lib/api/safe-details";

export type DecodeProvenance =
  | "safe-service"
  | "verified-abi"
  | "signature-database"
  | "raw";

export interface ContractInsight {
  readonly metadata: Awaited<ReturnType<AbiPort["getContractMetadata"]>>;
  readonly implementationChain: readonly string[];
  readonly decoded: DecodedCall | null;
  readonly provenance: DecodeProvenance;
  readonly signature: string | null;
}

function displayValue(value: unknown): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "";

  try {
    return JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    );
  } catch {
    return String(value);
  }
}

function normalizedCall(
  transaction: SafeTransaction,
  abi: readonly AbiFunction[],
): DecodedCall | null {
  try {
    const result = decodeFunctionData({
      abi: abi as Abi,
      data: transaction.data,
    });
    const definition = abi.find(
      (item) => item.name === result.functionName,
    );
    if (!definition) return null;

    const args = Array.isArray(result.args) ? result.args : [];
    const parameters: DecodedParameter[] = definition.inputs.map(
      (input, index) => ({
        name: input.name,
        type: input.type,
        value: displayValue(args[index]),
        nestedCalls: [],
      }),
    );

    return {
      method: result.functionName,
      parameters,
      to: transaction.to,
      value: transaction.value.toString(),
      data: transaction.data,
      operation: transaction.operation,
    };
  } catch {
    return null;
  }
}

function functionFromSignature(signature: string): AbiFunction | null {
  try {
    const item = parseAbiItem(`function ${signature}`);
    if (item.type !== "function") return null;

    return item as ViemAbiFunction as AbiFunction;
  } catch {
    return null;
  }
}

export async function resolveContractInsight(
  safeData: SafeDataPort,
  abiPort: AbiPort,
  transaction: SafeTransaction,
): Promise<ContractInsight> {
  const [metadata, implementationChain, safeDecoded] = await Promise.all([
    abiPort.getContractMetadata(transaction.safe.chainId, transaction.to),
    abiPort.resolveImplementationChain(
      transaction.safe.chainId,
      transaction.to,
    ),
    resolveDecodedCall(safeData, transaction),
  ]);

  if (safeDecoded) {
    return {
      metadata,
      implementationChain,
      decoded: safeDecoded,
      provenance: "safe-service",
      signature: null,
    };
  }

  if (metadata.verified && metadata.abi) {
    const decoded = normalizedCall(transaction, metadata.abi);
    if (decoded) {
      return {
        metadata,
        implementationChain,
        decoded,
        provenance: "verified-abi",
        signature: null,
      };
    }
  }

  const selector = transaction.data.slice(0, 10) as `0x${string}`;
  const signature = await abiPort.lookupFunctionSignature(selector);
  const signatureFunction = signature
    ? functionFromSignature(signature)
    : null;
  const decoded = signatureFunction
    ? normalizedCall(transaction, [signatureFunction])
    : null;

  return {
    metadata,
    implementationChain,
    decoded,
    provenance: decoded ? "signature-database" : "raw",
    signature,
  };
}
