import type { Address, ChainId } from "../../domain";
import { xdcProtocolRegistryEntries } from "./xdc-protocol-registry";

export const CONTRACT_REGISTRY_VERSION = "2026-09-03.2";

export type ContractRegistrySource =
  | "safe-deployments"
  | "evm-specification"
  | "protocol-documentation";
export type ContractRegistryExecutionRole = "safe-singleton" | null;
export type ContractRegistryTrustPolicy =
  | "protocol-whitelist"
  | "identity-only";
export type ContractRegistryLifecycle = "active" | "internal" | "deprecated";
export type ContractRegistryProtocol =
  | "safe"
  | "evm"
  | "xswap"
  | "curve"
  | "silo"
  | "morpho"
  | "fathom"
  | "oku-uniswap"
  | "stargate";
export type ContractRegistryCategory = "infrastructure" | "protocol";
export type ContractRegistryVerification =
  | "specification"
  | "publisher-documented"
  | "publisher-documented-bytecode-present";
export type ContractRegistryRole =
  | "safe-singleton"
  | "fallback-handler"
  | "batch-executor"
  | "proxy-factory"
  | "signing-library"
  | "simulation-accessor"
  | "precompile"
  | "dex-factory"
  | "dex-router"
  | "token"
  | "multicall"
  | "implementation"
  | "library"
  | "data-provider"
  | "gauge-factory"
  | "zap"
  | "vault"
  | "registry"
  | "lending-pool"
  | "interest-rate-model"
  | "oracle-factory"
  | "vault-factory"
  | "adapter-factory"
  | "bundler"
  | "adapter"
  | "proxy-admin"
  | "position-manager"
  | "migrator"
  | "staking"
  | "quoter"
  | "permit"
  | "limit-order"
  | "keeper"
  | "bridge-messaging"
  | "bridge-token"
  | "bridge-wrapper"
  | "treasurer"
  | "lending-router"
  | "liquidation-helper"
  | "lending-factory"
  | "oracle"
  | "control"
  | "incentives-controller"
  | "lending-configurator"
  | "token-gateway"
  | "helper";

export interface ContractRegistryEntry {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly label: string;
  readonly protocol: ContractRegistryProtocol;
  readonly category: ContractRegistryCategory;
  readonly role: ContractRegistryRole;
  readonly source: ContractRegistrySource;
  readonly reference: string;
  readonly verification: ContractRegistryVerification;
  readonly reviewedAt: string;
  readonly logoKey: string | null;
  readonly executionRole: ContractRegistryExecutionRole;
  readonly trustPolicy: ContractRegistryTrustPolicy;
  readonly lifecycle: ContractRegistryLifecycle;
}

interface SafeDeploymentSeed {
  readonly address: Address;
  readonly label: string;
  readonly asset: string;
  readonly role: ContractRegistryRole;
  readonly executionRole: ContractRegistryExecutionRole;
}

const REVIEWED_AT = "2026-09-03";
const SAFE_DEPLOYMENTS_ROOT =
  "https://github.com/safe-global/safe-deployments/blob/0974182c16c57ca6fe2b9bba8cffb8a7e55fb83c/src/assets/v1.4.1";
const EVM_SPECIFICATION_REFERENCE =
  "https://ethereum.github.io/yellowpaper/paper.pdf";
const SUPPORTED_CHAINS = [1, 50] as const satisfies readonly ChainId[];

const safeDeployments: readonly SafeDeploymentSeed[] = [
  {
    address: "0x41675C099F32341bf84BFc5382aF534df5C7461a" as Address,
    label: "Safe v1.4.1 Singleton",
    asset: "safe.json",
    role: "safe-singleton",
    executionRole: "safe-singleton",
  },
  {
    address: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as Address,
    label: "Safe v1.4.1 L2 Singleton",
    asset: "safe_l2.json",
    role: "safe-singleton",
    executionRole: "safe-singleton",
  },
  {
    address: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address,
    label: "Safe v1.4.1 Compatibility Fallback Handler",
    asset: "compatibility_fallback_handler.json",
    role: "fallback-handler",
    executionRole: null,
  },
  {
    address: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526" as Address,
    label: "Safe v1.4.1 MultiSend",
    asset: "multi_send.json",
    role: "batch-executor",
    executionRole: null,
  },
  {
    address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2" as Address,
    label: "Safe v1.4.1 MultiSendCallOnly",
    asset: "multi_send_call_only.json",
    role: "batch-executor",
    executionRole: null,
  },
  {
    address: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address,
    label: "Safe v1.4.1 Proxy Factory",
    asset: "safe_proxy_factory.json",
    role: "proxy-factory",
    executionRole: null,
  },
  {
    address: "0xd53cd0aB83D845Ac265BE939c57F53AD838012c9" as Address,
    label: "Safe v1.4.1 SignMessageLib",
    asset: "sign_message_lib.json",
    role: "signing-library",
    executionRole: null,
  },
  {
    address: "0x3d4BA2E0884aa488718476ca2FB8Efc291A46199" as Address,
    label: "Safe v1.4.1 SimulateTxAccessor",
    asset: "simulate_tx_accessor.json",
    role: "simulation-accessor",
    executionRole: null,
  },
];

const entries: readonly ContractRegistryEntry[] = [
  ...SUPPORTED_CHAINS.flatMap((chainId) =>
    safeDeployments.map((deployment) => ({
      chainId,
      address: deployment.address,
      label: deployment.label,
      protocol: "safe" as const,
      category: "infrastructure" as const,
      role: deployment.role,
      source: "safe-deployments" as const,
      reference: `${SAFE_DEPLOYMENTS_ROOT}/${deployment.asset}`,
      verification: "publisher-documented" as const,
      reviewedAt: REVIEWED_AT,
      logoKey: "safe",
      executionRole: deployment.executionRole,
      trustPolicy: "identity-only" as const,
      lifecycle: "active" as const,
    })),
  ),
  ...SUPPORTED_CHAINS.map((chainId) => ({
    chainId,
    address: "0x0000000000000000000000000000000000000001" as Address,
    label: "ECRECOVER precompile",
    protocol: "evm" as const,
    category: "infrastructure" as const,
    role: "precompile" as const,
    source: "evm-specification" as const,
    reference: EVM_SPECIFICATION_REFERENCE,
    verification: "specification" as const,
    reviewedAt: REVIEWED_AT,
    logoKey: null,
    executionRole: null,
    trustPolicy: "identity-only" as const,
    lifecycle: "active" as const,
  })),
  ...xdcProtocolRegistryEntries,
];

function registryKey(chainId: ChainId, address: Address): string {
  return `${chainId}:${address.toLowerCase()}`;
}

const entriesByKey = new Map(
  entries.map((entry) => [registryKey(entry.chainId, entry.address), entry]),
);

export function findContractRegistryEntry(
  chainId: ChainId,
  address: Address,
): ContractRegistryEntry | null {
  return entriesByKey.get(registryKey(chainId, address)) ?? null;
}

export function contractRegistryEntriesForChain(
  chainId: ChainId,
): readonly ContractRegistryEntry[] {
  return entries.filter((entry) => entry.chainId === chainId);
}
