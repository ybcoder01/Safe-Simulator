import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";

import {
  decodeTokenDecimals,
  decodeTokenSymbol,
  ERC20_DECIMALS_SELECTOR,
  ERC20_SYMBOL_SELECTOR,
  formatTokenAmount,
} from "@/core/analysis/tokens/metadata";
import type { Address, ChainId, Hex } from "@/core/domain";
import type { ChainPort } from "@/core/ports";
import { groupDigits } from "@/lib/api/token-presentation";
import type { AttestedProtocolAddress } from "@/lib/api/protocol-route-attestation";

// A Silo market is also its own collateral share token. The attestation keeps
// one label per address, so a market can carry either of these labels.
const SILO_MARKET_LABELS: ReadonlySet<string> = new Set([
  "Silo market vault",
  "Silo collateral share token",
]);

const MAX_SHARE_MOVEMENTS = 4;
const PROTECTED_COLLATERAL = 0;
const STANDARD_COLLATERAL = 1;

const shareAbi = parseAbi(["function silo() view returns (address)"]);
const siloAbi = parseAbi([
  "function config() view returns (address)",
  "function convertToAssets(uint256 shares, uint8 collateralType) view returns (uint256)",
]);
const configAbi = parseAbi([
  "function getConfig(address silo) view returns ((uint256 daoFee,uint256 deployerFee,address silo,address token,address protectedShareToken,address collateralShareToken,address debtShareToken,address solvencyOracle,address maxLtvOracle,address interestRateModel,uint256 maxLtv,uint256 lt,uint256 liquidationTargetLtv,uint256 liquidationFee,uint256 flashloanFee,address hookReceiver,bool callBeforeQuote) config)",
]);

export interface SiloShareValue {
  /** Underlying asset amount the share movement is redeemable for, already formatted. */
  readonly amount: string;
  readonly symbol: string;
}

export interface SiloShareMovement {
  readonly logIndex: number;
  readonly token: string;
  readonly amount: string;
}

/**
 * Share tokens are valued both when they arrive (a deposit) and when they are
 * handed in (a withdrawal), so every movement into or out of the Safe counts.
 */
export function siloShareMovements(
  movements: readonly {
    readonly direction: string;
    readonly logIndex: number;
    readonly token: string;
    readonly amount: string;
  }[],
): readonly SiloShareMovement[] {
  return movements
    .filter(
      (movement) =>
        movement.direction === "inbound" || movement.direction === "outbound",
    )
    .map((movement) => ({
      logIndex: movement.logIndex,
      token: movement.token,
      amount: movement.amount,
    }));
}

export function attestedSiloMarkets(
  addresses: readonly AttestedProtocolAddress[],
): readonly Address[] {
  return addresses
    .filter((item) => SILO_MARKET_LABELS.has(item.label))
    .map((item) => item.address);
}

function same(a: string, b: string) {
  return a.toLowerCase() === b.toLowerCase();
}

async function valueOne(
  chain: Pick<ChainPort, "call">,
  chainId: ChainId,
  markets: readonly Address[],
  movement: SiloShareMovement,
  blockNumber: bigint | undefined,
): Promise<SiloShareValue | null> {
  const read = (to: Address, data: Hex) =>
    chain.call(chainId, { to, data }, blockNumber);
  const token = getAddress(movement.token) as Address;

  const silo = decodeFunctionResult({
    abi: shareAbi,
    functionName: "silo",
    data: await read(
      token,
      encodeFunctionData({ abi: shareAbi, functionName: "silo" }),
    ),
  }) as Address;
  // The share token only vouches for itself, so it is trusted solely when its
  // market was independently proven through the official factory.
  if (!markets.some((market) => same(market, silo))) return null;

  const siloConfig = decodeFunctionResult({
    abi: siloAbi,
    functionName: "config",
    data: await read(
      silo,
      encodeFunctionData({ abi: siloAbi, functionName: "config" }),
    ),
  }) as Address;
  const config = decodeFunctionResult({
    abi: configAbi,
    functionName: "getConfig",
    data: await read(
      siloConfig,
      encodeFunctionData({
        abi: configAbi,
        functionName: "getConfig",
        args: [silo],
      }),
    ),
  });

  let collateralType: number;
  if (same(config.protectedShareToken, token)) {
    collateralType = PROTECTED_COLLATERAL;
  } else if (same(config.collateralShareToken, token)) {
    collateralType = STANDARD_COLLATERAL;
  } else {
    return null;
  }

  const [assets, symbolWord, decimalsWord] = await Promise.all([
    read(
      silo,
      encodeFunctionData({
        abi: siloAbi,
        functionName: "convertToAssets",
        args: [BigInt(movement.amount), collateralType],
      }),
    ),
    read(config.token, ERC20_SYMBOL_SELECTOR),
    read(config.token, ERC20_DECIMALS_SELECTOR),
  ]);
  const symbol = decodeTokenSymbol(symbolWord);
  const decimals = decodeTokenDecimals(decimalsWord);
  const raw = decodeFunctionResult({
    abi: siloAbi,
    functionName: "convertToAssets",
    data: assets,
  });
  const amount = groupDigits(formatTokenAmount(raw.toString(), decimals));
  return symbol && amount ? { amount, symbol } : null;
}

/**
 * Looks up what Silo deposit share movements are worth in the underlying
 * asset. Best effort: any lookup that fails simply yields no value.
 */
export async function resolveSiloShareValues(
  chain: Pick<ChainPort, "call">,
  input: {
    readonly chainId: ChainId;
    readonly markets: readonly Address[];
    readonly movements: readonly SiloShareMovement[];
    readonly blockNumber: bigint | null;
  },
): Promise<ReadonlyMap<number, SiloShareValue>> {
  const values = new Map<number, SiloShareValue>();
  if (input.markets.length === 0) return values;

  const settled = await Promise.allSettled(
    input.movements
      .filter((movement) => /^[0-9]+$/.test(movement.amount))
      .slice(0, MAX_SHARE_MOVEMENTS)
      .map(async (movement) => ({
        logIndex: movement.logIndex,
        value: await valueOne(
          chain,
          input.chainId,
          input.markets,
          movement,
          input.blockNumber ?? undefined,
        ),
      })),
  );
  for (const result of settled) {
    if (result.status === "fulfilled" && result.value.value) {
      values.set(result.value.logIndex, result.value.value);
    }
  }
  return values;
}
