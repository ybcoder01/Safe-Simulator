import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  keccak256,
  parseAbi,
} from "viem";

import {
  contractRegistryEntriesForChain,
  findContractRegistryEntry,
} from "@/core/analysis/trust/contract-registry";
import type { Address, Finding, Hex, SafeTransaction } from "@/core/domain";
import type { CachePort, ChainPort } from "@/core/ports";
import type { ExecutionInsight } from "@/lib/api/execution-insight";
import type { InternalProxyBoundary } from "@/lib/api/internal-proxy-boundaries";

const SILO_FACTORY = "0xf81d90DF1B63d48536E78564d24d5DD8F2BE58aD" as Address;
const MAX_CANDIDATE_CONTRACTS = 32;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// EIP-1967 implementation slot. The market proxy's runtime identity is part
// of the approval fingerprint.
const IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex;
const BEACON_SLOT =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as Hex;
// Legacy OpenZeppelin / ZeppelinOS implementation slot, still used by some proxies.
const LEGACY_IMPLEMENTATION_SLOT =
  "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3" as Hex;
const EIP_1167_PREFIX = "363d3d373d3d3d363d73";
const EIP_1167_SUFFIX = "5af43d82803e903d91602b57fd5bf3";
// Stop following proxy chains that never resolve to runtime code.
const MAX_RUNTIME_PROXY_DEPTH = 4;
// Unrelated XDC pages must not wait on a slow Silo Factory read.
const FACTORY_MEMBERSHIP_TIMEOUT_MS = 500;
const FACTORY_MEMBERSHIP_LATEST_TTL_SECONDS = 600;
const FACTORY_MEMBERSHIP_BLOCK_TTL_SECONDS = 2_592_000;

const factoryAbi = parseAbi([
  "function isSilo(address silo) view returns (bool)",
]);
const beaconAbi = parseAbi([
  "function implementation() view returns (address)",
]);
const siloAbi = parseAbi([
  "function config() view returns (address siloConfig)",
]);
const configAbi = parseAbi([
  "function getSilos() view returns (address silo0, address silo1)",
  "function getConfig(address silo) view returns ((uint256 daoFee,uint256 deployerFee,address silo,address token,address protectedShareToken,address collateralShareToken,address debtShareToken,address solvencyOracle,address maxLtvOracle,address interestRateModel,uint256 maxLtv,uint256 lt,uint256 liquidationTargetLtv,uint256 liquidationFee,uint256 flashloanFee,address hookReceiver,bool callBeforeQuote) config)",
]);

const hookAbi = parseAbi([
  "function configuredGauges(address shareToken) view returns (address gauge)",
]);

const rateModelAbi = parseAbi([
  "function irmConfig() view returns (address config)",
]);

const oracleAbi = parseAbi([
  "function oracle() view returns (address wrapped)",
  "function oracleConfig() view returns (address config)",
  "function baseToken() view returns (address)",
  "function quoteToken() view returns (address)",
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

export interface ProtocolVerificationCheck {
  readonly key: "destination" | "factory" | "configuration" | "route";
  readonly status: "pass" | "review" | "fail";
  readonly title: string;
  readonly detail: string;
}

export interface ProtocolRouteAttestation {
  readonly protocol: "silo" | null;
  readonly status: "not-applicable" | "verified" | "review" | "unavailable";
  readonly title: string;
  readonly detail: string;
  readonly addresses: readonly AttestedProtocolAddress[];
  readonly proxyBoundaries: readonly InternalProxyBoundary[];
  readonly checks: readonly ProtocolVerificationCheck[];
  readonly findings: readonly Finding[];
  /**
   * Configuration the team would be approving. Address-book trust matches a
   * market only when the stored fingerprint equals this value.
   */
  readonly marketReviews: readonly SiloMarketReview[];
}

export interface SiloMarketReview {
  readonly address: Address;
  readonly fingerprint: string;
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

function factoryMembershipKey(
  transaction: SafeTransaction,
  address: Address,
): string {
  const block = transaction.blockNumber?.toString() ?? "latest";
  return `silo-factory-membership:v1:${transaction.safe.chainId}:${addressKey(address)}:${block}`;
}

async function readCachedFactoryMembership(
  cache: Pick<CachePort, "get"> | null | undefined,
  key: string,
): Promise<boolean | null> {
  if (!cache) return null;
  try {
    const cached = await cache.get<boolean>(key);
    return cached === true || cached === false ? cached : null;
  } catch {
    return null;
  }
}

type FactoryMembership = "member" | "not-member" | "unknown";

export type BackgroundSchedule = (task: Promise<unknown>) => void;

function retainBackground(
  task: Promise<unknown>,
  schedule?: BackgroundSchedule | null,
) {
  const guarded = task.catch(() => undefined);
  if (schedule) {
    try {
      schedule(guarded);
    } catch {
      // The lookup is already running. A scheduler failure must not hide it.
    }
    return;
  }
  // Keep the warm-up alive after the response on Vercel. Outside a request
  // this throws, and the promise is left running on its own.
  void import("next/server")
    .then(({ after }) => {
      try {
        after(() => guarded);
      } catch {
        // No request scope.
      }
    })
    .catch(() => undefined);
}

async function readFactoryMembership(
  chain: ChainPort,
  transaction: SafeTransaction,
  address: Address,
): Promise<boolean> {
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
}

function membershipTtl(transaction: SafeTransaction): number {
  return transaction.blockNumber === null
    ? FACTORY_MEMBERSHIP_LATEST_TTL_SECONDS
    : FACTORY_MEMBERSHIP_BLOCK_TTL_SECONDS;
}

async function factoryMembership(
  chain: ChainPort,
  transaction: SafeTransaction,
  address: Address,
  options: {
    readonly cache?: Pick<CachePort, "get" | "set"> | null | undefined;
    readonly timeoutMs?: number;
    readonly schedule?: BackgroundSchedule | null | undefined;
  } = {},
): Promise<FactoryMembership> {
  const key = factoryMembershipKey(transaction, address);
  const cached = await readCachedFactoryMembership(options.cache, key);
  if (cached === true) return "member";
  if (cached === false) return "not-member";

  const lookup = readFactoryMembership(chain, transaction, address);
  const ttl = membershipTtl(transaction);
  const store = (member: boolean) => {
    // A definitive factory answer stands even when the cache write fails.
    const cache = options.cache;
    if (!cache) return Promise.resolve();
    try {
      return Promise.resolve(cache.set(key, member, ttl)).catch(
        () => undefined,
      );
    } catch {
      return Promise.resolve();
    }
  };

  try {
    const member = await (options.timeoutMs === undefined
      ? lookup
      : withTimeout(lookup, options.timeoutMs));
    await store(member);
    return member ? "member" : "not-member";
  } catch (error) {
    // A timeout or RPC error is not "not a Silo". Finish the in-flight read,
    // or retry once, and cache only a real answer.
    const timedOut =
      error instanceof Error && error.message === "silo-factory-timeout";
    if (options.timeoutMs !== undefined) {
      const warm = (
        timedOut ? lookup : readFactoryMembership(chain, transaction, address)
      ).then(store);
      retainBackground(warm, options.schedule);
    }
    return "unknown";
  }
}

async function isFactorySilo(
  chain: ChainPort,
  transaction: SafeTransaction,
  address: Address,
  options: {
    readonly cache?: Pick<CachePort, "get" | "set"> | null | undefined;
  } = {},
): Promise<boolean> {
  // Unbounded reads used after the destination is already a Silo route.
  // Unknown stays unproven rather than being cached as non-member.
  return (
    (await factoryMembership(chain, transaction, address, options)) === "member"
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("silo-factory-timeout")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function addressFromWord(word: Hex): Address {
  const body = word.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return getAddress(`0x${body.slice(-40)}`) as Address;
}

export interface DependencyRuntimeIdentity {
  readonly address: Address;
  readonly implementation: Address;
  readonly runtimeHash: Hex;
}

/**
 * Stable review id for one Silo market at the transaction block. The market
 * and every critical dependency contribute a runtime identity, not only an
 * address. EIP-1967, legacy, beacon, and EIP-1167 proxies are followed until
 * the code that actually runs is hashed, so an upgrade changes the id. `null`
 * means that role is unset. A missing identity is omitted entirely and cannot
 * be approved.
 */
export function siloMarketReviewFingerprint(input: {
  readonly chainId: number;
  readonly market: Address;
  readonly implementation: Address;
  readonly runtimeHash: Hex;
  readonly token: DependencyRuntimeIdentity | null;
  readonly protectedShareToken: DependencyRuntimeIdentity | null;
  readonly collateralShareToken: DependencyRuntimeIdentity | null;
  readonly debtShareToken: DependencyRuntimeIdentity | null;
  readonly solvencyOracle: DependencyRuntimeIdentity | null;
  readonly maxLtvOracle: DependencyRuntimeIdentity | null;
  readonly interestRateModel: DependencyRuntimeIdentity | null;
  readonly hookReceiver: DependencyRuntimeIdentity | null;
  readonly daoFee: bigint;
  readonly deployerFee: bigint;
  readonly maxLtv: bigint;
  readonly lt: bigint;
  readonly liquidationTargetLtv: bigint;
  readonly liquidationFee: bigint;
  readonly flashloanFee: bigint;
  readonly callBeforeQuote: boolean;
}): string {
  const dependency = (identity: DependencyRuntimeIdentity | null) =>
    identity
      ? `${identity.address}:${identity.implementation}:${identity.runtimeHash}`
      : "absent";
  return [
    "silo-market-v2",
    input.chainId,
    input.market,
    input.implementation,
    input.runtimeHash,
    dependency(input.token),
    dependency(input.protectedShareToken),
    dependency(input.collateralShareToken),
    dependency(input.debtShareToken),
    dependency(input.solvencyOracle),
    dependency(input.maxLtvOracle),
    dependency(input.interestRateModel),
    dependency(input.hookReceiver),
    input.daoFee,
    input.deployerFee,
    input.maxLtv,
    input.lt,
    input.liquidationTargetLtv,
    input.liquidationFee,
    input.flashloanFee,
    input.callBeforeQuote ? "1" : "0",
  ]
    .join(":")
    .toLowerCase();
}

function pointsElsewhere(candidate: Address, account: Address): boolean {
  const key = addressKey(candidate);
  return key !== ZERO_ADDRESS && key !== addressKey(account);
}

function minimalProxyTarget(code: Hex): Address | null {
  const body = code.toLowerCase().replace(/^0x/, "");
  if (body.length !== EIP_1167_PREFIX.length + 40 + EIP_1167_SUFFIX.length) {
    return null;
  }
  if (!body.startsWith(EIP_1167_PREFIX) || !body.endsWith(EIP_1167_SUFFIX)) {
    return null;
  }
  return getAddress(
    `0x${body.slice(EIP_1167_PREFIX.length, EIP_1167_PREFIX.length + 40)}`,
  ) as Address;
}

type RuntimeStep =
  | { readonly kind: "follow"; readonly address: Address }
  | { readonly kind: "code"; readonly code: Hex }
  | { readonly kind: "unresolved" };

/**
 * One proxy hop. A slot that names the account itself is ignored so the
 * account's own code can still be hashed. Empty code, a beacon with no
 * implementation, or a failed read is unresolved and cannot be approved.
 */
async function nextRuntimeStep(
  chain: ChainPort,
  transaction: SafeTransaction,
  account: Address,
): Promise<RuntimeStep> {
  const block = transaction.blockNumber ?? undefined;
  const readSlot = (slot: Hex) =>
    chain.getStorageAt(transaction.safe.chainId, account, slot, block);

  const implementation = addressFromWord(await readSlot(IMPLEMENTATION_SLOT));
  if (pointsElsewhere(implementation, account)) {
    return { kind: "follow", address: implementation };
  }
  const legacy = addressFromWord(await readSlot(LEGACY_IMPLEMENTATION_SLOT));
  if (pointsElsewhere(legacy, account)) {
    return { kind: "follow", address: legacy };
  }
  const beacon = addressFromWord(await readSlot(BEACON_SLOT));
  if (pointsElsewhere(beacon, account)) {
    const result = await callContract(
      chain,
      transaction,
      beacon,
      encodeFunctionData({ abi: beaconAbi, functionName: "implementation" }),
    );
    const resolved = getAddress(
      decodeFunctionResult({
        abi: beaconAbi,
        functionName: "implementation",
        data: result,
      }),
    ) as Address;
    if (!pointsElsewhere(resolved, account)) return { kind: "unresolved" };
    return { kind: "follow", address: resolved };
  }

  const code = await chain.getCode(transaction.safe.chainId, account, block);
  if (!code || code === "0x") return { kind: "unresolved" };
  const clone = minimalProxyTarget(code);
  if (clone && pointsElsewhere(clone, account)) {
    return { kind: "follow", address: clone };
  }
  return { kind: "code", code };
}

async function runtimeIdentity(
  chain: ChainPort,
  transaction: SafeTransaction,
  account: Address,
): Promise<DependencyRuntimeIdentity | null> {
  try {
    let current = getAddress(account) as Address;
    const seen = new Set<string>([addressKey(current)]);
    for (let depth = 0; depth < MAX_RUNTIME_PROXY_DEPTH; depth += 1) {
      const step = await nextRuntimeStep(chain, transaction, current);
      if (step.kind === "unresolved") return null;
      if (step.kind === "code") {
        return {
          address: getAddress(account) as Address,
          implementation: current,
          runtimeHash: keccak256(step.code),
        };
      }
      const nextKey = addressKey(step.address);
      if (seen.has(nextKey)) return null;
      seen.add(nextKey);
      current = step.address;
    }
    return null;
  } catch {
    return null;
  }
}

const CRITICAL_DEPENDENCY_KEYS = [
  "token",
  "protectedShareToken",
  "collateralShareToken",
  "debtShareToken",
  "solvencyOracle",
  "maxLtvOracle",
  "interestRateModel",
  "hookReceiver",
] as const;

async function criticalDependencyIdentities(
  chain: ChainPort,
  transaction: SafeTransaction,
  config: ConfigData & { readonly silo: Address },
  marketIdentity: DependencyRuntimeIdentity,
): Promise<Record<
  (typeof CRITICAL_DEPENDENCY_KEYS)[number],
  DependencyRuntimeIdentity | null
> | null> {
  const identities = {} as Record<
    (typeof CRITICAL_DEPENDENCY_KEYS)[number],
    DependencyRuntimeIdentity | null
  >;
  for (const key of CRITICAL_DEPENDENCY_KEYS) {
    const dependency = config[key];
    if (addressKey(dependency) === ZERO_ADDRESS) {
      identities[key] = null;
      continue;
    }
    if (addressKey(dependency) === addressKey(marketIdentity.address)) {
      identities[key] = marketIdentity;
      continue;
    }
    const identity = await runtimeIdentity(chain, transaction, dependency);
    if (!identity) return null;
    identities[key] = identity;
  }
  return identities;
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
    // In Silo V2 the market is its own collateral share token. Keeping the
    // market label for that address avoids showing a vault as a share token.
    ...(addressKey(config.collateralShareToken) === addressKey(config.silo)
      ? []
      : [
          {
            address: config.collateralShareToken,
            label: "Silo collateral share token",
          },
        ]),
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

/**
 * The market's hook receiver is part of the configuration proven through the
 * factory, so an incentives controller it names for one of the market's share
 * tokens is part of the same proven configuration. Lookups are best effort;
 * a gauge that cannot be read simply stays unattested.
 */
async function configuredGauges(
  chain: ChainPort,
  transaction: SafeTransaction,
  config: ConfigData,
): Promise<readonly AttestedProtocolAddress[]> {
  if (addressKey(config.hookReceiver) === ZERO_ADDRESS) return [];

  const shareTokens = [
    config.protectedShareToken,
    config.collateralShareToken,
    config.debtShareToken,
  ].filter((token) => addressKey(token) !== ZERO_ADDRESS);
  const results = await Promise.allSettled(
    shareTokens.map(async (token) => {
      const result = await callContract(
        chain,
        transaction,
        config.hookReceiver,
        encodeFunctionData({
          abi: hookAbi,
          functionName: "configuredGauges",
          args: [token],
        }),
      );
      return getAddress(
        decodeFunctionResult({
          abi: hookAbi,
          functionName: "configuredGauges",
          data: result,
        }),
      ) as Address;
    }),
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" && addressKey(result.value) !== ZERO_ADDRESS
      ? [
          {
            address: result.value,
            label: "Silo incentives controller set by the hook receiver",
          },
        ]
      : [],
  );
}

async function readAddress(
  chain: ChainPort,
  transaction: SafeTransaction,
  address: Address,
  functionName: "oracle" | "oracleConfig" | "baseToken" | "quoteToken",
): Promise<Address | null> {
  try {
    const result = await callContract(
      chain,
      transaction,
      address,
      encodeFunctionData({ abi: oracleAbi, functionName }),
    );
    const value = getAddress(
      decodeFunctionResult({ abi: oracleAbi, functionName, data: result }),
    ) as Address;
    return addressKey(value) === ZERO_ADDRESS ? null : value;
  } catch {
    return null;
  }
}

/**
 * A market's interest-rate model reads its parameters from a configuration
 * contract it names itself, so that contract is part of the same proven
 * configuration. A failed lookup leaves it unattested.
 */
async function rateModelConfiguration(
  chain: ChainPort,
  transaction: SafeTransaction,
  config: ConfigData,
): Promise<readonly AttestedProtocolAddress[]> {
  if (addressKey(config.interestRateModel) === ZERO_ADDRESS) return [];
  try {
    const result = await callContract(
      chain,
      transaction,
      config.interestRateModel,
      encodeFunctionData({ abi: rateModelAbi, functionName: "irmConfig" }),
    );
    const value = getAddress(
      decodeFunctionResult({
        abi: rateModelAbi,
        functionName: "irmConfig",
        data: result,
      }),
    ) as Address;
    return addressKey(value) === ZERO_ADDRESS
      ? []
      : [
          {
            address: value,
            label: "Silo interest-rate model configuration",
          },
        ];
  } catch {
    return [];
  }
}

/**
 * Words of an oracle configuration that are contract addresses. The layout
 * differs per oracle type, so every address-shaped word is a candidate and the
 * caller keeps only those the execution actually called.
 */
async function configurationAddressWords(
  chain: ChainPort,
  transaction: SafeTransaction,
  configuration: Address,
): Promise<readonly Address[]> {
  try {
    const result = await callContract(
      chain,
      transaction,
      configuration,
      "0xc3f909d4",
    );
    const body = result.slice(2);
    const words = body.match(/.{64}/g) ?? [];
    return words
      .filter((word) => /^0{24}[0-9a-f]{40}$/i.test(word))
      .map((word) => getAddress(`0x${word.slice(24)}`) as Address)
      .filter(
        (address) =>
          addressKey(address) !== ZERO_ADDRESS && !isPrecompile(address),
      );
  } catch {
    return [];
  }
}

/**
 * The market's oracles are part of the configuration proven through the
 * factory. Oracles they wrap, the configuration contracts those oracles read,
 * and the price sources named in that configuration are the same proven
 * configuration one step further out. Only contracts the execution actually
 * called are attested, tokens are never mistaken for price sources, and any
 * lookup that fails leaves the address unattested.
 */
async function oracleDependencies(
  chain: ChainPort,
  transaction: SafeTransaction,
  config: ConfigData,
  traced: ReadonlySet<string>,
): Promise<readonly AttestedProtocolAddress[]> {
  const oracles = [
    ...new Map(
      [config.solvencyOracle, config.maxLtvOracle]
        .filter((oracle) => addressKey(oracle) !== ZERO_ADDRESS)
        .map((oracle) => [addressKey(oracle), oracle]),
    ).values(),
  ];

  const perOracle = await Promise.all(
    oracles.map(async (oracle) => {
      const found: AttestedProtocolAddress[] = [];
      const wrapped = await readAddress(chain, transaction, oracle, "oracle");
      const layers = wrapped ? [oracle, wrapped] : [oracle];
      if (wrapped) {
        found.push({
          address: wrapped,
          label: "Silo oracle wrapped by the market's oracle",
        });
      }

      const tokens = new Set<string>([addressKey(config.token)]);
      for (const layer of layers) {
        for (const getter of ["baseToken", "quoteToken"] as const) {
          const token = await readAddress(chain, transaction, layer, getter);
          if (token) tokens.add(addressKey(token));
        }
      }

      for (const layer of layers) {
        const configuration = await readAddress(
          chain,
          transaction,
          layer,
          "oracleConfig",
        );
        if (!configuration) continue;
        found.push({
          address: configuration,
          label: "Silo oracle configuration",
        });
        for (const word of await configurationAddressWords(
          chain,
          transaction,
          configuration,
        )) {
          if (
            traced.has(addressKey(word)) &&
            !tokens.has(addressKey(word)) &&
            addressKey(word) !== addressKey(configuration)
          ) {
            found.push({
              address: word,
              label: "Price source named by the Silo oracle configuration",
            });
          }
        }
      }
      return found;
    }),
  );
  return perOracle.flat();
}

async function attestSiloMarket(
  chain: ChainPort,
  transaction: SafeTransaction,
  silo: Address,
  traced: ReadonlySet<string>,
  cache?: Pick<CachePort, "get" | "set"> | null,
): Promise<{
  readonly addresses: readonly AttestedProtocolAddress[];
  readonly reviews: readonly SiloMarketReview[];
} | null> {
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
      silos.map((item) => isFactorySilo(chain, transaction, item, { cache })),
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

    const gauges = await Promise.all(
      (configs as readonly ConfigData[]).map((item) =>
        configuredGauges(chain, transaction, item),
      ),
    );

    const dependencies = await Promise.all(
      (configs as readonly ConfigData[]).map((item) =>
        oracleDependencies(chain, transaction, item, traced),
      ),
    );

    const rateModels = await Promise.all(
      (configs as readonly ConfigData[]).map((item) =>
        rateModelConfiguration(chain, transaction, item),
      ),
    );

    const reviews: SiloMarketReview[] = [];
    for (const item of configs) {
      const identity = await runtimeIdentity(chain, transaction, item.silo);
      if (!identity) continue;
      const dependencies = await criticalDependencyIdentities(
        chain,
        transaction,
        item,
        identity,
      );
      // No fingerprint unless every configured dependency has a runtime
      // identity. An unknown proxy cannot stay approved.
      if (!dependencies) continue;
      reviews.push({
        address: identity.address,
        fingerprint: siloMarketReviewFingerprint({
          chainId: transaction.safe.chainId,
          market: identity.address,
          implementation: identity.implementation,
          runtimeHash: identity.runtimeHash,
          token: dependencies.token,
          protectedShareToken: dependencies.protectedShareToken,
          collateralShareToken: dependencies.collateralShareToken,
          debtShareToken: dependencies.debtShareToken,
          solvencyOracle: dependencies.solvencyOracle,
          maxLtvOracle: dependencies.maxLtvOracle,
          interestRateModel: dependencies.interestRateModel,
          hookReceiver: dependencies.hookReceiver,
          daoFee: item.daoFee,
          deployerFee: item.deployerFee,
          maxLtv: item.maxLtv,
          lt: item.lt,
          liquidationTargetLtv: item.liquidationTargetLtv,
          liquidationFee: item.liquidationFee,
          flashloanFee: item.flashloanFee,
          callBeforeQuote: item.callBeforeQuote,
        }),
      });
    }

    return {
      addresses: uniqueAddresses([
        ...dependencies.flat(),
        ...rateModels.flat(),
        ...gauges.flat(),
        { address: SILO_FACTORY, label: "Official Silo Factory" },
        { address: configAddress, label: "Silo market configuration" },
        ...configs.flatMap((item) => configAddresses(item)),
      ]),
      reviews,
    };
  } catch {
    return null;
  }
}

/**
 * Whether the destination's identity is settled without any explorer data: the
 * whole traced route was tied to a factory-proven Silo market graph. That
 * covers the pinned Silo router and direct calls to a factory market vault
 * (for example `redeem` on the market itself). The permissionless-market
 * finding is only produced once no traced contract is left unaccounted for.
 */
export function isSiloRouteProven(
  targetProtocol: string | undefined,
  attestation: Pick<ProtocolRouteAttestation, "protocol" | "findings">,
): boolean {
  if (
    attestation.protocol !== "silo" ||
    !attestation.findings.some(
      (finding) => finding.code === "silo-permissionless-market",
    )
  ) {
    return false;
  }
  // Registry-pinned Silo entrypoints, or a factory market with no static row.
  return targetProtocol === "silo" || targetProtocol === undefined;
}

function siloDestinationCheck(
  entrypoint: "router" | "market",
): ProtocolVerificationCheck {
  if (entrypoint === "market") {
    return {
      key: "destination",
      status: "pass",
      title: "Factory-created Silo market",
      detail:
        "The destination is recognized by Silo's live factory contract as a Silo market vault.",
    };
  }
  return {
    key: "destination",
    status: "pass",
    title: "Official Silo router",
    detail: "The destination matches the reviewed Silo deployment record.",
  };
}

function factoryLookupUnavailable(
  destination: Address,
): ProtocolRouteAttestation {
  return {
    protocol: "silo",
    status: "unavailable",
    title: "Silo verification temporarily unavailable",
    detail:
      "The Silo Factory did not answer in time, so this destination was not classified. The lookup continues in the background. Reload the report before relying on it.",
    addresses: [],
    proxyBoundaries: [],
    checks: [
      {
        key: "factory",
        status: "review",
        title: "Silo Factory lookup timed out",
        detail:
          "A slow or failed factory read is not treated as proof that this contract is unrelated to Silo.",
      },
    ],
    findings: [
      {
        code: "silo-factory-lookup-unavailable",
        severity: "warning",
        title: "Silo verification temporarily unavailable",
        detail:
          "The Silo Factory did not answer in time. This destination was not classified, and the lookup continues in the background. Reload before relying on the report.",
        addresses: [destination],
      },
    ],
    marketReviews: [],
  };
}

function notApplicable(): ProtocolRouteAttestation {
  return {
    protocol: null,
    status: "not-applicable",
    title: "No protocol-specific attestation",
    detail: "The destination does not use a supported route attestor.",
    addresses: [],
    proxyBoundaries: [],
    checks: [],
    findings: [],
    marketReviews: [],
  };
}

function expandAttestedProxyGraph(
  addresses: readonly AttestedProtocolAddress[],
  boundaries: readonly InternalProxyBoundary[],
): readonly AttestedProtocolAddress[] {
  const expanded = [...addresses];
  const known = new Set(addresses.map((item) => addressKey(item.address)));
  let changed = true;

  while (changed) {
    changed = false;
    for (const boundary of boundaries) {
      if (
        known.has(addressKey(boundary.proxy)) &&
        !known.has(addressKey(boundary.implementation))
      ) {
        expanded.push({
          address: boundary.implementation,
          label: "Verified implementation used by the Silo route",
        });
        known.add(addressKey(boundary.implementation));
        changed = true;
      }
    }
  }

  return uniqueAddresses(expanded);
}

const MAX_LIBRARY_PROOF_IMPLEMENTATIONS = 8;

function embedsAddress(code: string, address: Address): boolean {
  const body = code.toLowerCase().replace(/^0x/, "");
  const needle = `73${addressKey(address).slice(2)}`;
  let index = body.indexOf(needle);
  while (index !== -1) {
    if (index % 2 === 0) return true;
    index = body.indexOf(needle, index + 1);
  }
  return false;
}

/**
 * A delegatecall from an attested market to a contract outside the proven graph
 * is explained only when that contract's address is hard-linked into the
 * runtime bytecode of the market's own resolved implementation (a PUSH20
 * immediate, which is how Solidity links external libraries). The caller must
 * already be attested and the implementation must be an observed boundary.
 */
async function proveLinkedLibraries(
  chain: ChainPort,
  transaction: SafeTransaction,
  execution: Pick<ExecutionInsight, "internalCalls">,
  attested: readonly AttestedProtocolAddress[],
  boundaries: readonly InternalProxyBoundary[],
): Promise<{
  readonly addresses: readonly AttestedProtocolAddress[];
  readonly boundaries: readonly InternalProxyBoundary[];
}> {
  const attestedKeys = new Set(
    attested.map((item) => addressKey(item.address)),
  );
  const implementationsByProxy = new Map<string, Address[]>();
  for (const boundary of boundaries) {
    const key = addressKey(boundary.proxy);
    if (
      !attestedKeys.has(key) ||
      !attestedKeys.has(addressKey(boundary.implementation))
    ) {
      continue;
    }
    implementationsByProxy.set(key, [
      ...(implementationsByProxy.get(key) ?? []),
      boundary.implementation,
    ]);
  }

  const candidates = [
    ...new Map(
      execution.internalCalls
        .filter(
          (call) =>
            call.operation === "delegatecall" &&
            isAddress(call.from) &&
            isAddress(call.to) &&
            attestedKeys.has(addressKey(call.from)) &&
            !attestedKeys.has(addressKey(call.to)) &&
            !isPrecompile(call.to as Address) &&
            implementationsByProxy.has(addressKey(call.from)),
        )
        .map((call) => [
          `${addressKey(call.from)}:${addressKey(call.to)}`,
          {
            proxy: getAddress(call.from) as Address,
            library: getAddress(call.to) as Address,
          },
        ]),
    ).values(),
  ];
  if (candidates.length === 0) return { addresses: [], boundaries: [] };

  const codeByImplementation = new Map<string, Promise<string>>();
  const codeOf = (implementation: Address) => {
    const key = addressKey(implementation);
    if (!codeByImplementation.has(key)) {
      if (codeByImplementation.size >= MAX_LIBRARY_PROOF_IMPLEMENTATIONS) {
        return Promise.resolve("0x");
      }
      codeByImplementation.set(
        key,
        Promise.resolve()
          .then(() =>
            chain.getCode(
              transaction.safe.chainId,
              implementation,
              transaction.blockNumber ?? undefined,
            ),
          )
          .catch(() => "0x"),
      );
    }
    return codeByImplementation.get(key) as Promise<string>;
  };

  const proofs = await Promise.all(
    candidates.map(async ({ proxy, library }) => {
      for (const implementation of implementationsByProxy.get(
        addressKey(proxy),
      ) ?? []) {
        if (embedsAddress(await codeOf(implementation), library)) {
          return { proxy, library };
        }
      }
      return null;
    }),
  );
  const proven = proofs.filter(
    (item): item is { proxy: Address; library: Address } => item !== null,
  );

  return {
    addresses: uniqueAddresses(
      proven.map(({ library }) => ({
        address: library,
        label: "Library linked into the Silo market implementation",
      })),
    ),
    boundaries: proven.map(({ proxy, library }) => ({
      proxy,
      implementation: library,
    })),
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
  resolvedProxyBoundaries: readonly InternalProxyBoundary[] = [],
  cache?: Pick<CachePort, "get" | "set"> | null,
  scheduleBackground?: BackgroundSchedule | null,
): Promise<ProtocolRouteAttestation> {
  if (transaction.safe.chainId !== 50) {
    return notApplicable();
  }

  const target = findContractRegistryEntry(
    transaction.safe.chainId,
    transaction.to,
  );
  const destination = getAddress(transaction.to) as Address;
  const registrySilo = target?.protocol === "silo";
  // Direct market calls (redeem/deposit on the vault) are not in the pinned
  // Silo registry; prove them through the official factory instead.
  let destinationIsFactorySilo = false;
  if (!registrySilo) {
    const membership = await factoryMembership(
      chain,
      transaction,
      destination,
      {
        cache,
        timeoutMs: FACTORY_MEMBERSHIP_TIMEOUT_MS,
        schedule: scheduleBackground,
      },
    );
    if (membership === "unknown") return factoryLookupUnavailable(destination);
    if (membership === "not-member") return notApplicable();
    destinationIsFactorySilo = true;
  }
  const entrypoint = destinationIsFactorySilo ? "market" : "router";

  const staticSiloAddresses = contractRegistryEntriesForChain(50)
    .filter((entry) => entry.protocol === "silo")
    .map((entry) => ({ address: entry.address, label: entry.label }));
  const staticKeys = new Set(
    staticSiloAddresses.map((item) => addressKey(item.address)),
  );
  const tracedCandidates = [
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
        addressKey(address) !== addressKey(destination) &&
        addressKey(address) !== ZERO_ADDRESS &&
        !isPrecompile(address) &&
        findContractRegistryEntry(50, address)?.protocol !== "safe",
    );
  // When the Safe calls the market vault directly, the destination is the
  // market to attest — it would otherwise be filtered out above.
  const candidates = (
    destinationIsFactorySilo
      ? [destination, ...tracedCandidates]
      : tracedCandidates
  ).slice(0, MAX_CANDIDATE_CONTRACTS);

  const siloFlags = await Promise.all(
    candidates.map(async (address) => {
      // Already proven above when the Safe called the market vault directly.
      if (
        destinationIsFactorySilo &&
        addressKey(address) === addressKey(destination)
      ) {
        return true;
      }
      return isFactorySilo(chain, transaction, address, { cache });
    }),
  );
  const markets = candidates.filter((_, index) => siloFlags[index] === true);
  if (markets.length === 0) {
    return {
      protocol: "silo",
      status: "unavailable",
      title: "Silo market lineage could not be proven",
      detail:
        entrypoint === "market"
          ? "The destination looks like a Silo market, but it could not be verified through the official Silo Factory."
          : "The official router was recognized, but no traced market could be verified through the official Silo Factory.",
      addresses: staticSiloAddresses,
      proxyBoundaries: [],
      checks: [
        siloDestinationCheck(entrypoint),
        {
          key: "factory",
          status: "fail",
          title: "Market origin not confirmed",
          detail:
            "No market in the executed route could be linked to the official Silo Factory.",
        },
      ],
      findings: [
        {
          code: "protocol-route-attestation-incomplete",
          severity: "warning",
          title: "The Silo market route could not be proven",
          detail:
            entrypoint === "market"
              ? "Safe Inspector could not connect this destination to a market created by the official Silo Factory."
              : "Safe Inspector recognized the official router but could not connect the traced route to a market created by the official Silo Factory.",
          addresses: candidates,
        },
      ],
      marketReviews: [],
    };
  }

  const tracedAddresses = new Set(
    execution.internalCalls.flatMap((call) => [
      addressKey(call.from),
      addressKey(call.to),
    ]),
  );
  const marketEvidence = await Promise.all(
    markets.map((market) =>
      attestSiloMarket(chain, transaction, market, tracedAddresses, cache),
    ),
  );
  const incompleteMarkets = markets.filter(
    (_, index) => marketEvidence[index] === null,
  );
  const marketReviews = marketEvidence.flatMap((item) => item?.reviews ?? []);
  const baseAttested = uniqueAddresses([
    ...staticSiloAddresses,
    ...marketEvidence.flatMap((item) => item?.addresses ?? []),
  ]);
  const proxyAttested = expandAttestedProxyGraph(
    baseAttested,
    resolvedProxyBoundaries,
  );
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
  const proxyAttestedKeys = new Set(
    proxyAttested.map((item) => addressKey(item.address)),
  );
  const staticBoundaries = execution.internalCalls
    .filter(
      (call) =>
        call.operation === "delegatecall" &&
        isAddress(call.from) &&
        isAddress(call.to) &&
        proxyAttestedKeys.has(addressKey(call.from)) &&
        staticDelegateTargets.has(addressKey(call.to)),
    )
    .map((call) => ({
      proxy: getAddress(call.from) as Address,
      implementation: getAddress(call.to) as Address,
    }));
  const linkedLibraries = await proveLinkedLibraries(
    chain,
    transaction,
    execution,
    proxyAttested,
    [...resolvedProxyBoundaries, ...staticBoundaries],
  );
  const attested = uniqueAddresses([
    ...proxyAttested,
    ...linkedLibraries.addresses,
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
            !attestedKeys.has(addressKey(address)) &&
            findContractRegistryEntry(50, address)?.protocol !== "safe",
        )
        .map((address) => [addressKey(address), address]),
    ).values(),
  ];
  const proxyBoundaries = uniqueBoundaries([
    ...linkedLibraries.boundaries,
    ...resolvedProxyBoundaries.filter(
      (boundary) =>
        attestedKeys.has(addressKey(boundary.proxy)) &&
        attestedKeys.has(addressKey(boundary.implementation)),
    ),
    ...staticBoundaries.filter((boundary) =>
      attestedKeys.has(addressKey(boundary.proxy)),
    ),
  ]);

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
      checks: [
        siloDestinationCheck(entrypoint),
        {
          key: "factory",
          status: "pass",
          title: "Market created by the official factory",
          detail:
            "The market address is recognized by Silo's live factory contract.",
        },
        {
          key: "configuration",
          status: incompleteMarkets.length > 0 ? "fail" : "pass",
          title:
            incompleteMarkets.length > 0
              ? "Market configuration could not be fully read"
              : "Market assets and configuration confirmed",
          detail:
            incompleteMarkets.length > 0
              ? "At least one market relationship could not be independently reconstructed."
              : "The paired vaults, assets, share tokens, oracles, rate models, and hooks were read from the live Silo configuration.",
        },
        {
          key: "route",
          status: unknownTargets.length > 0 ? "review" : "pass",
          title:
            unknownTargets.length > 0
              ? `${unknownTargets.length} connected contract${unknownTargets.length === 1 ? "" : "s"} still unconfirmed`
              : "All traced contracts accounted for",
          detail:
            unknownTargets.length > 0
              ? "Do not give final approval until every connected contract is linked to the expected Silo route."
              : "No contract outside the reconstructed route appeared in the trace.",
        },
      ],
      findings: [
        {
          code: "protocol-route-attestation-incomplete",
          severity: "warning",
          title: "Part of the Silo route is still unresolved",
          detail:
            entrypoint === "market"
              ? "Safe Inspector verified the factory-created market relationships it could read, but at least one traced address remains outside that proven graph."
              : "Safe Inspector verified the official router and factory-created market relationships it could read, but at least one traced address remains outside that proven graph.",
          addresses,
        },
      ],
      marketReviews,
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
    checks: [
      siloDestinationCheck(entrypoint),
      {
        key: "factory",
        status: "pass",
        title: "Market created by the official factory",
        detail:
          "The market address is recognized by Silo's live factory contract.",
      },
      {
        key: "configuration",
        status: "pass",
        title: "Market assets and configuration confirmed",
        detail:
          "The live market configuration matches the contracts used in the route.",
      },
      {
        key: "route",
        status: "pass",
        title: "All connected contracts accounted for",
        detail:
          "Every traced contract is linked to the proven Silo market graph.",
      },
    ],
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
    marketReviews,
  };
}
