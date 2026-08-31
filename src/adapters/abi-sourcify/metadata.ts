import { getAddress, isAddress, toHex } from "viem";

import { findContractRegistryEntry } from "@/core/analysis/trust/contract-registry";
import type {
  AbiFunction,
  AbiParameter,
  Address,
  ChainId,
  ContractMetadata,
  Hex,
  StorageLayout,
} from "@/core/domain";
import type { AbiPort, ChainPort } from "@/core/ports";

const SOURCIFY_CONTRACT_API = "https://sourcify.dev/server/v2/contract";
const SOURCIFY_SIGNATURE_API =
  "https://api.4byte.sourcify.dev/signature-database/v1/lookup";
const EIP_1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;
const EIP_1967_BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as Hex;
const BEACON_IMPLEMENTATION_CALL = "0x5c60da1b" as Hex;
const MAX_IMPLEMENTATION_DEPTH = 8;

type Fetcher = typeof fetch;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null
    ? (value as JsonRecord)
    : null;
}

function abiParameter(value: unknown): AbiParameter | null {
  const item = record(value);
  if (!item || typeof item.type !== "string") return null;

  const components = Array.isArray(item.components)
    ? item.components
        .map(abiParameter)
        .filter((component): component is AbiParameter => component !== null)
    : undefined;

  return {
    name: typeof item.name === "string" ? item.name : "",
    type: item.type,
    ...(components ? { components } : {}),
  };
}

function abiFunction(value: unknown): AbiFunction | null {
  const item = record(value);
  if (
    !item ||
    item.type !== "function" ||
    typeof item.name !== "string" ||
    !Array.isArray(item.inputs) ||
    !Array.isArray(item.outputs)
  ) {
    return null;
  }

  const inputs = item.inputs.map(abiParameter);
  const outputs = item.outputs.map(abiParameter);
  if (inputs.some((parameter) => parameter === null)) return null;
  if (outputs.some((parameter) => parameter === null)) return null;

  const mutability = item.stateMutability;
  const stateMutability =
    mutability === "pure" ||
    mutability === "view" ||
    mutability === "nonpayable" ||
    mutability === "payable"
      ? mutability
      : "nonpayable";

  return {
    type: "function",
    name: item.name,
    stateMutability,
    inputs: inputs as AbiParameter[],
    outputs: outputs as AbiParameter[],
  };
}

function addressFromWord(value: Hex | undefined): Address | null {
  if (!value || value === "0x") return null;

  try {
    if (BigInt(value) === 0n) return null;
    const candidate = `0x${value.slice(-40)}`;
    return isAddress(candidate) ? (getAddress(candidate) as Address) : null;
  } catch {
    return null;
  }
}

function storageLayout(value: unknown): StorageLayout | null {
  const layout = record(value);
  if (!layout || !Array.isArray(layout.storage)) return null;

  const types = record(layout.types);
  const slots = layout.storage.flatMap((value) => {
    const item = record(value);
    if (
      !item ||
      typeof item.slot !== "string" ||
      typeof item.label !== "string" ||
      typeof item.type !== "string" ||
      !Number.isInteger(item.offset) ||
      (item.offset as number) < 0
    ) {
      return [];
    }

    try {
      const numericSlot = BigInt(item.slot);
      if (numericSlot < 0n) return [];
      const type = record(types?.[item.type]);
      const byteLength =
        typeof type?.numberOfBytes === "string"
          ? Number(type.numberOfBytes)
          : Number.NaN;

      return [
        {
          slot: toHex(numericSlot, { size: 32 }) as Hex,
          label: item.label,
          type: typeof type?.label === "string" ? type.label : item.type,
          offset: item.offset as number,
          numberOfBytes:
            Number.isSafeInteger(byteLength) && byteLength >= 0
              ? byteLength
              : null,
          encoding: typeof type?.encoding === "string" ? type.encoding : null,
        },
      ];
    } catch {
      return [];
    }
  });

  return slots.length > 0 ? { slots } : null;
}

function unknownMetadata(
  chainId: ChainId,
  address: Address,
  implementation: Address | null,
): ContractMetadata {
  const registry = findContractRegistryEntry(chainId, address);

  return {
    address,
    chainId,
    label: registry?.label ?? null,
    verified: false,
    abi: null,
    implementation,
    storageLayout: null,
    source: registry ? "registry" : "unknown",
  };
}

export class PublicAbiAdapter implements AbiPort {
  constructor(
    private readonly chain: ChainPort,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async getContractMetadata(
    chainId: ChainId,
    address: Address,
  ): Promise<ContractMetadata> {
    const implementationChain = await this.resolveImplementationChain(
      chainId,
      address,
    );
    const implementation = implementationChain[0] ?? null;
    const lookupAddress = implementationChain.at(-1) ?? address;

    const verified = await this.getSourcifyMetadata(chainId, lookupAddress);
    if (!verified) {
      return unknownMetadata(chainId, address, implementation);
    }

    return {
      ...verified,
      address,
      implementation,
    };
  }

  async resolveImplementationChain(
    chainId: ChainId,
    address: Address,
  ): Promise<readonly Address[]> {
    const implementations: Address[] = [];
    const visited = new Set<string>([address.toLowerCase()]);
    let current = address;

    for (let depth = 0; depth < MAX_IMPLEMENTATION_DEPTH; depth += 1) {
      const implementation = await this.resolveDirectImplementation(
        chainId,
        current,
      );
      if (!implementation || visited.has(implementation.toLowerCase())) break;

      const code = await this.chain
        .getCode(chainId, implementation)
        .catch(() => "0x" as Hex);
      if (code === "0x") break;

      implementations.push(implementation);
      visited.add(implementation.toLowerCase());
      current = implementation;
    }

    return implementations;
  }

  async lookupFunctionSignature(selector: Hex): Promise<string | null> {
    if (!/^0x[0-9a-fA-F]{8}$/.test(selector)) return null;

    try {
      const response = await this.fetcher(
        `${SOURCIFY_SIGNATURE_API}?function=${selector.toLowerCase()}&filter=true`,
        { cache: "force-cache" },
      );
      if (!response.ok) return null;

      const body = record(await response.json());
      const result = record(body?.result);
      const functions = record(result?.function);
      const matches = functions?.[selector.toLowerCase()];
      if (!Array.isArray(matches)) return null;

      const names = [
        ...new Set(
          matches
            .map((match) => record(match))
            .filter((match): match is JsonRecord => match !== null)
            .filter((match) => match.hasVerifiedContract === true)
            .map((match) => match.name)
            .filter((name): name is string => typeof name === "string"),
        ),
      ];

      return names.length === 1 ? (names[0] ?? null) : null;
    } catch {
      return null;
    }
  }

  private async getSourcifyMetadata(
    chainId: ChainId,
    address: Address,
  ): Promise<ContractMetadata | null> {
    try {
      const response = await this.fetcher(
        `${SOURCIFY_CONTRACT_API}/${chainId}/${address}?fields=abi,compilation,storageLayout`,
        { cache: "force-cache" },
      );
      if (!response.ok) return null;

      const body = record(await response.json());
      if (!body || !Array.isArray(body.abi)) return null;

      const functions = body.abi
        .map(abiFunction)
        .filter((item): item is AbiFunction => item !== null);
      const compilation = record(body.compilation);

      return {
        address,
        chainId,
        label: typeof compilation?.name === "string" ? compilation.name : null,
        verified: true,
        abi: functions,
        implementation: null,
        storageLayout: storageLayout(body.storageLayout),
        source: "sourcify",
      };
    } catch {
      return null;
    }
  }

  private async resolveDirectImplementation(
    chainId: ChainId,
    address: Address,
  ): Promise<Address | null> {
    const direct = addressFromWord(
      await this.chain
        .getStorageAt(chainId, address, EIP_1967_IMPLEMENTATION_SLOT)
        .catch(() => "0x" as Hex),
    );
    if (direct) return direct;

    const beacon = addressFromWord(
      await this.chain
        .getStorageAt(chainId, address, EIP_1967_BEACON_SLOT)
        .catch(() => "0x" as Hex),
    );
    if (!beacon) return null;

    const beaconCode = await this.chain
      .getCode(chainId, beacon)
      .catch(() => "0x" as Hex);
    if (beaconCode === "0x") return null;

    return addressFromWord(
      await this.chain
        .call(chainId, { to: beacon, data: BEACON_IMPLEMENTATION_CALL })
        .catch(() => "0x" as Hex),
    );
  }
}
