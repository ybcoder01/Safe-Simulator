import type { Address, ChainId } from "../../domain";

export const CONTRACT_REGISTRY_VERSION = "2026-09-03.1";

export type ContractRegistrySource =
  | "safe-deployments"
  | "evm-specification"
  | "protocol-documentation";
export type ContractRegistryExecutionRole = "safe-singleton" | null;
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
  | "token";

export interface ContractRegistryEntry {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly label: string;
  readonly protocol: "safe" | "evm" | "xswap";
  readonly category: ContractRegistryCategory;
  readonly role: ContractRegistryRole;
  readonly source: ContractRegistrySource;
  readonly reference: string;
  readonly verification: ContractRegistryVerification;
  readonly reviewedAt: string;
  readonly logoKey: string | null;
  readonly executionRole: ContractRegistryExecutionRole;
}

interface SafeDeploymentSeed {
  readonly address: Address;
  readonly label: string;
  readonly asset: string;
  readonly role: ContractRegistryRole;
  readonly executionRole: ContractRegistryExecutionRole;
}

interface XSwapDeploymentSeed {
  readonly address: Address;
  readonly label: string;
  readonly role: "dex-factory" | "dex-router" | "token";
  readonly logoKey: string | null;
}

const REVIEWED_AT = "2026-09-03";
const SAFE_DEPLOYMENTS_ROOT =
  "https://github.com/safe-global/safe-deployments/blob/0974182c16c57ca6fe2b9bba8cffb8a7e55fb83c/src/assets/v1.4.1";
const EVM_SPECIFICATION_REFERENCE =
  "https://ethereum.github.io/yellowpaper/paper.pdf";
const XSWAP_CONTRACT_REFERENCE =
  "https://docs.xspswap.finance/xswap-protocol/contracts/xswap-protocol-contracts";
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

const xswapDeployments: readonly XSwapDeploymentSeed[] = [
  {
    address: "0x347D14b13a68457186b2450bb2a6c2Fd7B38352f" as Address,
    label: "XSwap V2 Factory",
    role: "dex-factory",
    logoKey: "xswap",
  },
  {
    address: "0xf9c5E4f6E627201aB2d6FB6391239738Cf4bDcf9" as Address,
    label: "XSwap V2 Router",
    role: "dex-router",
    logoKey: "xswap",
  },
  {
    address: "0xe1bcb1c502a545ee85a1881b95cdd46d394d2b2e" as Address,
    label: "XSwap V3 Universal Router",
    role: "dex-router",
    logoKey: "xswap",
  },
  {
    address: "0x3b9edecc4286ba33ea6e27119c2a4db99829839d" as Address,
    label: "XSwap V3 SwapRouter02",
    role: "dex-router",
    logoKey: "xswap",
  },
  {
    address: "0xecf4ea7907e779b8a7d0f90cb95fe06f43b610fb" as Address,
    label: "XSwap V3 Router",
    role: "dex-router",
    logoKey: "xswap",
  },
  {
    address: "0x36726235dAdbdb4658D33E62a249dCA7c4B2bC68" as Address,
    label: "XSP Token",
    role: "token",
    logoKey: "xsp",
  },
  {
    address: "0x17476dc3eda45aD916cEAdDeA325B240A7FB259D" as Address,
    label: "XSwap Treasury Token",
    role: "token",
    logoKey: "xtt",
  },
  {
    address: "0x951857744785E80e2De051c32EE7b25f9c458C42" as Address,
    label: "Wrapped XDC",
    role: "token",
    logoKey: "wxdc",
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
  })),
  ...xswapDeployments.map((deployment) => ({
    chainId: 50,
    address: deployment.address,
    label: deployment.label,
    protocol: "xswap" as const,
    category: "protocol" as const,
    role: deployment.role,
    source: "protocol-documentation" as const,
    reference: XSWAP_CONTRACT_REFERENCE,
    verification: "publisher-documented-bytecode-present" as const,
    reviewedAt: REVIEWED_AT,
    logoKey: deployment.logoKey,
    executionRole: null,
  })),
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
