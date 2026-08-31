import type { Address, ChainId } from "../../domain";

export type ContractRegistrySource = "safe-deployments" | "evm-specification";

export interface ContractRegistryEntry {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly label: string;
  readonly source: ContractRegistrySource;
  readonly reference: string;
}

interface SafeDeploymentSeed {
  readonly address: Address;
  readonly label: string;
  readonly asset: string;
}

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
  },
  {
    address: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as Address,
    label: "Safe v1.4.1 L2 Singleton",
    asset: "safe_l2.json",
  },
  {
    address: "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address,
    label: "Safe v1.4.1 Compatibility Fallback Handler",
    asset: "compatibility_fallback_handler.json",
  },
  {
    address: "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526" as Address,
    label: "Safe v1.4.1 MultiSend",
    asset: "multi_send.json",
  },
  {
    address: "0x9641d764fc13c8B624c04430C7356C1C7C8102e2" as Address,
    label: "Safe v1.4.1 MultiSendCallOnly",
    asset: "multi_send_call_only.json",
  },
  {
    address: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address,
    label: "Safe v1.4.1 Proxy Factory",
    asset: "safe_proxy_factory.json",
  },
  {
    address: "0xd53cd0aB83D845Ac265BE939c57F53AD838012c9" as Address,
    label: "Safe v1.4.1 SignMessageLib",
    asset: "sign_message_lib.json",
  },
  {
    address: "0x3d4BA2E0884aa488718476ca2FB8Efc291A46199" as Address,
    label: "Safe v1.4.1 SimulateTxAccessor",
    asset: "simulate_tx_accessor.json",
  },
];

const entries: readonly ContractRegistryEntry[] = [
  ...SUPPORTED_CHAINS.flatMap((chainId) =>
    safeDeployments.map((deployment) => ({
      chainId,
      address: deployment.address,
      label: deployment.label,
      source: "safe-deployments" as const,
      reference: `${SAFE_DEPLOYMENTS_ROOT}/${deployment.asset}`,
    })),
  ),
  ...SUPPORTED_CHAINS.map((chainId) => ({
    chainId,
    address: "0x0000000000000000000000000000000000000001" as Address,
    label: "ECRECOVER precompile",
    source: "evm-specification" as const,
    reference: EVM_SPECIFICATION_REFERENCE,
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
