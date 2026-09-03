import type { Address, ChainId } from "../../domain";

export const TOKEN_REGISTRY_VERSION = "2026-09-03.1";

export type TokenKind = "fungible" | "liquidity-position" | "unknown";
export type TokenLogoKey =
  | "wxdc"
  | "xsp"
  | "xtt"
  | "fallback-token"
  | "fallback-lp";

export interface TokenRegistryEntry {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly name: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly kind: "fungible";
  readonly logoKey: Exclude<TokenLogoKey, "fallback-token" | "fallback-lp">;
  readonly reference: string;
  readonly reviewedAt: string;
}

export interface TokenIdentity {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly name: string | null;
  readonly symbol: string | null;
  readonly decimals: number | null;
  readonly kind: TokenKind;
  readonly logoKey: TokenLogoKey;
  readonly known: boolean;
  readonly reference: string | null;
}

const REVIEWED_AT = "2026-09-03";
const TOKEN_LIST_ROOT =
  "https://github.com/XSwapProtocol/xdc-token-list/blob/b476bed4d722d51e151ab719e2458cfe0db23a00/assets";

const entries: readonly TokenRegistryEntry[] = [
  {
    chainId: 50,
    address: "0x951857744785E80e2De051c32EE7b25f9c458C42" as Address,
    name: "Wrapped XDC",
    symbol: "WXDC",
    decimals: 18,
    kind: "fungible",
    logoKey: "wxdc",
    reference:
      `${TOKEN_LIST_ROOT}/0x951857744785E80e2De051c32EE7b25f9c458C42/info.json`,
    reviewedAt: REVIEWED_AT,
  },
  {
    chainId: 50,
    address: "0x36726235dAdbdb4658D33E62a249dCA7c4B2bC68" as Address,
    name: "XSP Token",
    symbol: "XSP",
    decimals: 18,
    kind: "fungible",
    logoKey: "xsp",
    reference:
      `${TOKEN_LIST_ROOT}/0x36726235dAdbdb4658D33E62a249dCA7c4B2bC68/info.json`,
    reviewedAt: REVIEWED_AT,
  },
  {
    chainId: 50,
    address: "0x17476dc3eda45aD916cEAdDeA325B240A7FB259D" as Address,
    name: "XSwap Treasury Token",
    symbol: "XTT",
    decimals: 18,
    kind: "fungible",
    logoKey: "xtt",
    reference:
      `${TOKEN_LIST_ROOT}/0x17476dc3eda45aD916cEAdDeA325B240A7FB259D/info.json`,
    reviewedAt: REVIEWED_AT,
  },
];

function tokenKey(chainId: ChainId, address: Address): string {
  return `${chainId}:${address.toLowerCase()}`;
}

const entriesByKey = new Map(
  entries.map((entry) => [tokenKey(entry.chainId, entry.address), entry]),
);

export function findTokenRegistryEntry(
  chainId: ChainId,
  address: Address,
): TokenRegistryEntry | null {
  return entriesByKey.get(tokenKey(chainId, address)) ?? null;
}

export function tokenRegistryEntriesForChain(
  chainId: ChainId,
): readonly TokenRegistryEntry[] {
  return entries.filter((entry) => entry.chainId === chainId);
}

export function resolveTokenIdentity(
  chainId: ChainId,
  address: Address,
  options: { readonly liquidityPosition?: boolean } = {},
): TokenIdentity {
  const known = findTokenRegistryEntry(chainId, address);
  if (known) {
    return {
      ...known,
      known: true,
    };
  }

  const liquidityPosition = options.liquidityPosition === true;
  return {
    chainId,
    address,
    name: null,
    symbol: null,
    decimals: null,
    kind: liquidityPosition ? "liquidity-position" : "unknown",
    logoKey: liquidityPosition ? "fallback-lp" : "fallback-token",
    known: false,
    reference: null,
  };
}
