import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";

import {
  contractRegistryEntriesForChain,
  findContractRegistryEntry,
} from "@/core/analysis/trust/contract-registry";
import type { Address, Finding, SafeTransaction } from "@/core/domain";
import type { ChainPort } from "@/core/ports";
import type { ExecutionInsight } from "@/lib/api/execution-insight";
import type { InternalProxyBoundary } from "@/lib/api/internal-proxy-boundaries";

const SILO_FACTORY = "0xf81d90DF1B63d48536E78564d24d5DD8F2BE58aD" as Address;
const MAX_CANDIDATE_CONTRACTS = 32;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const factoryAbi = parseAbi([
  "function isSilo(address silo) view returns (bool)",
]);
const siloAbi = parseAbi([
  "function config() view returns (address siloConfig)",
]);
const configAbi = parseAbi([
  "function getSilos() view returns (address silo0, address silo1)",
  "function getConfig(address silo) view returns ((uint256 daoFee,uint256 deployerFee,address silo,address token,address protectedShareToken,address collateralShareToken,address debtShareToken,address solvencyOracle,address maxLtvOracle,address interestRateModel,uint256 maxLtv,uint256 lt,uint256 liquidationTargetLtv,uint256 liquidationFee,uint256 flashloanFee,address hookReceiver,bool callBeforeQuote) config)",
]);

type ConfigData = {
  readonly silo: Address;
  readonly token: Address;
  readonly protectedShareToken: Address;
  readonly collateralShareToken: Address;
  readonly debtShareToken: Address;
  readonly solvencyOracle: Address;
  readonly maxLtvOracle: Address;
  readonly interestRateModel: Address;
  readonly hookReceiver: Address;
};

export interface AttestedProtocolAddress {
  readonly address: Address;
  readonly label: string;
}

export interface ProtocolRouteAttestation {
  readonly protocol: "silo" | null;
  readonly status: "not-applicable" | "verified" | "review" | "unavailable";
  readonly title: string;
  readonly detail: string;
  readonly addresses: readonly AttestedProtocolAddress[];
  readonly proxyBoundaries: readonly InternalProxyBoundary[];
  readonly findings: readonly Finding[];
}

function addressKey(value: string): string {
  return value.toLowerCase();
}

function isAddress(value: string): value is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

function uniqueAddresses(addresses: readonly AttestedProtocolAddress[]) {
  return [
    ...new Map(
      addresses.map((item) => [addressKey(item.address), item]),
    ).values(),
  ];
}

function uniqueBoundaries(boundaries: readonly InternalProxyBoundary[]) {
  return [
    ...new Map(
      boundaries.map((item) => [
        `${addressKey(item.proxy)}:${addressKey(item.implementation)}`,
        item,
      ]),
    ).values(),
  ];
}

function isPrecompile(address: Address): boolean {
  const value = BigInt(address);
  return value > 0n && value <= 0xffn;
}

async function callContract(
  chain: ChainPort,
  transaction: SafeTransaction,
  address: Address,
  data: `0x${string}`,
): Promise<`0x${string}`> {
  return chain.call(
    transaction.safe.chainId,
    { to: address, data },
    transaction.blockNumber ?? undefined,
  );
}

async function isFactorySilo(
  chain: ChainPort,
  transaction: SafeTransaction,
  address: Address,
): Promise<boolean> {
  try {
    const result = await callContract(
      chain,
      transaction,
      SILO_FACTORY,
      encodeFunctionData({
        abi: factoryAbi,
        functionName: "isSilo",
        args: [address],
      }),
    );
    return decodeFunctionResult({
      abi: factoryAbi,
      functionName: "isSilo",
      data: result,
    });
  } catch {
    return false;
  }
}

function configAddresses(
  config: ConfigData,
): readonly AttestedProtocolAddress[] {
  return [
    { address: config.silo, label: "Silo market vault" },
    { address: config.token, label: "Silo configured asset" },
    {
      address: config.protectedShareToken,
      label: "Silo protected share token",
    },
    {
      address: config.collateralShareToken,
      label: "Silo collateral share token",
    },
    { address: config.debtShareToken, label: "Silo debt share token" },
    { address: config.solvencyOracle, label: "Silo solvency oracle" },
    { address: config.maxLtvOracle, label: "Silo maximum-LTV oracle" },
    {
      address: config.interestRateModel,
      label: "Silo interest-rate model",
    },
    { address: config.hookReceiver, label: "Silo hook receiver" },
  ].filter((item) => addressKey(item.address) !== ZERO_ADDRESS);
}

async function attestSiloMarket(
  chain: ChainPort,
  transaction: SafeTransaction,
  silo: Address,
): Promise<readonly AttestedProtocolAddress[] | null> {
  try {
    const configResult = await callContract(
      chain,
      transaction,
      silo,
      encodeFunctionData({ abi: siloAbi, functionName: "config" }),
    );
    const configAddress = getAddress(
      decodeFunctionResult({
        abi: siloAbi,
        functionName: "config",
        data: configResult,
      }),
    ) as Address;
    const silosResult = await callContract(
      chain,
      transaction,
      configAddress,
      encodeFunctionData({ abi: configAbi, functionName: "getSilos" }),
    );
    const silos = decodeFunctionResult({
      abi: configAbi,
      functionName: "getSilos",
      data: silosResult,
    });
    const factoryProofs = await Promise.all(
      silos.map((item) => isFactorySilo(chain, transaction, item)),
    );
    if (!factoryProofs.every(Boolean)) return null;

    const configs = await Promise.all(
      silos.map(async (item) => {
        const result = await callContract(
          chain,
          transaction,
          configAddress,
          encodeFunctionData({
            abi: configAbi,
            functionName: "getConfig",
            args: [item],
          }),
        );
        return decodeFunctionResult({
          abi: configAbi,
          functionName: "getConfig",
          data: result,
        });
      }),
    );

    return uniqueAddresses([
      { address: SILO_FACTORY, label: "Official Silo Factory" },
      { address: configAddress, label: "Silo market configuration" },
      ...configs.flatMap((item) => configAddresses(item as ConfigData)),
    ]);
  } catch {
    return null;
  }
}

function notApplicable(): ProtocolRouteAttestation {
  return {
    protocol: null,
    status: "not-applicable",
    title: "No protocol-specific attestation",
    detail: "The destination does not use a supported route attestor.",
    addresses: [],
    proxyBoundaries: [],
    findings: [],
  };
}

/**
 * Proves protocol relationships from pinned publisher roots and live on-chain
 * getters. A relationship proof establishes route membership, never economic
 * safety. Permissionless protocol components remain an explicit review item.
 */
export async function resolveProtocolRouteAttestation(
  chain: ChainPort,
  transaction: SafeTransaction,
  execution: Pick<ExecutionInsight, "internalCalls">,
): Promise<ProtocolRouteAttestation> {
  const target = findContractRegistryEntry(
    transaction.safe.chainId,
    transaction.to,
  );
  if (target?.protocol !== "silo" || transaction.safe.chainId !== 50) {
    return notApplicable();
  }

  const staticSiloAddresses = contractRegistryEntriesForChain(50)
    .filter((entry) => entry.protocol === "silo")
    .map((entry) => ({ address: entry.address, label: entry.label }));
  const staticKeys = new Set(
    staticSiloAddresses.map((item) => addressKey(item.address)),
  );
  const candidates = [
    ...new Set(
      execution.internalCalls
        .flatMap((call) => [call.from, call.to])
        .filter(isAddress)
        .map(addressKey),
    ),
  ]
    .map((address) => getAddress(address) as Address)
    .filter(
      (address) =>
        !staticKeys.has(addressKey(address)) &&
        addressKey(address) !== addressKey(transaction.safe.address) &&
        addressKey(address) !== addressKey(transaction.to) &&
        addressKey(address) !== ZERO_ADDRESS &&
        !isPrecompile(address),
    )
    .slice(0, MAX_CANDIDATE_CONTRACTS);

  const siloFlags = await Promise.all(
    candidates.map((address) => isFactorySilo(chain, transaction, address)),
  );
  const markets = candidates.filter((_, index) => siloFlags[index] === true);
  if (markets.length === 0) {
    return {
      protocol: "silo",
      status: "unavailable",
      title: "Silo market lineage could not be proven",
      detail:
        "The official router was recognized, but no traced market could be verified through the official Silo Factory.",
      addresses: staticSiloAddresses,
      proxyBoundaries: [],
      findings: [
        {
          code: "protocol-route-attestation-incomplete",
          severity: "warning",
          title: "The Silo market route could not be proven",
          detail:
            "Safe Inspector recognized the official router but could not connect the traced route to a market created by the official Silo Factory.",
          addresses: candidates,
        },
      ],
    };
  }

  const marketEvidence = await Promise.all(
    markets.map((market) => attestSiloMarket(chain, transaction, market)),
  );
  const incompleteMarkets = markets.filter(
    (_, index) => marketEvidence[index] === null,
  );
  const attested = uniqueAddresses([
    ...staticSiloAddresses,
    ...marketEvidence.flatMap((items) => items ?? []),
  ]);
  const attestedKeys = new Set(
    attested.map((item) => addressKey(item.address)),
  );
  const unknownTargets = [
    ...new Map(
      execution.internalCalls
        .map((call) => call.to)
        .filter(isAddress)
        .map((address) => getAddress(address) as Address)
        .filter(
          (address) =>
            addressKey(address) !== addressKey(transaction.safe.address) &&
            addressKey(address) !== ZERO_ADDRESS &&
            !isPrecompile(address) &&
            !attestedKeys.has(addressKey(address)),
        )
        .map((address) => [addressKey(address), address]),
    ).values(),
  ];
  const staticDelegateTargets = new Set(
    contractRegistryEntriesForChain(50)
      .filter(
        (entry) =>
          entry.protocol === "silo" &&
          entry.lifecycle === "internal" &&
          entry.trustPolicy === "identity-only",
      )
      .map((entry) => addressKey(entry.address)),
  );
  const proxyBoundaries = uniqueBoundaries(
    execution.internalCalls
      .filter(
        (call) =>
          call.operation === "delegatecall" &&
          isAddress(call.from) &&
          isAddress(call.to) &&
          attestedKeys.has(addressKey(call.from)) &&
          staticDelegateTargets.has(addressKey(call.to)),
      )
      .map((call) => ({
        proxy: getAddress(call.from) as Address,
        implementation: getAddress(call.to) as Address,
      })),
  );

  if (incompleteMarkets.length > 0 || unknownTargets.length > 0) {
    const addresses = [...incompleteMarkets, ...unknownTargets];
    return {
      protocol: "silo",
      status: "review",
      title: "Silo route is only partly verified",
      detail:
        "Factory lineage was found, but at least one market relationship or traced contract is still unresolved.",
      addresses: attested,
      proxyBoundaries,
      findings: [
        {
          code: "protocol-route-attestation-incomplete",
          severity: "warning",
          title: "Part of the Silo route is still unresolved",
          detail:
            "Safe Inspector verified the official router and factory-created market relationships it could read, but at least one traced address remains outside that proven graph.",
          addresses,
        },
      ],
    };
  }

  return {
    protocol: "silo",
    status: "review",
    title: "Factory-created Silo market verified",
    detail:
      "Every traced contract belongs to the market's live Silo configuration or the pinned Silo deployment registry. Silo markets are permissionless, so factory origin alone does not prove the market configuration is safe.",
    addresses: attested,
    proxyBoundaries,
    findings: [
      {
        code: "silo-permissionless-market",
        severity: "warning",
        title: "This Silo market is factory-created but permissionless",
        detail:
          "The complete traced route matches the official Silo Factory and this market's live configuration. Silo explicitly warns that anyone can deploy a market with custom implementations and settings, so the market deployer and configuration still require an approved evidence record.",
        addresses: markets,
      },
    ],
  };
}
