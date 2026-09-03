import {
  resolveTokenIdentity,
  type TokenKind,
  type TokenLogoKey,
} from "@/core/analysis/trust/token-registry";
import type { Address } from "@/core/domain";

export interface TokenPresentation {
  readonly token: string | null;
  readonly name: string;
  readonly symbol: string;
  readonly kind: TokenKind;
  readonly logoKey: TokenLogoKey;
  readonly known: boolean;
}

export function isLikelyLiquidityPosition(
  symbol: string | null | undefined,
): boolean {
  const normalized = symbol?.trim() ?? "";
  return (
    /(?:^|[-_. ])lp(?:$|[-_. ])/i.test(normalized) ||
    /liquidity|pool share/i.test(normalized)
  );
}

export function resolveTokenPresentation(
  chainId: number,
  token: string | null,
  symbol: string | null,
): TokenPresentation {
  if (token === null) {
    return {
      token: null,
      name: chainId === 50 ? "XDC" : "Native asset",
      symbol: symbol?.trim() || (chainId === 50 ? "XDC" : "Native"),
      kind: "fungible",
      logoKey: chainId === 50 ? "wxdc" : "fallback-token",
      known: chainId === 50,
    };
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
    return {
      token,
      name: "Unknown token",
      symbol: symbol?.trim() || "Unknown",
      kind: "unknown",
      logoKey: "fallback-token",
      known: false,
    };
  }

  const identity = resolveTokenIdentity(chainId, token as Address, {
    liquidityPosition: isLikelyLiquidityPosition(symbol),
  });

  return {
    token,
    name:
      identity.name ??
      (identity.kind === "liquidity-position"
        ? "Unreviewed liquidity-position token"
        : "Unknown token"),
    symbol: identity.symbol ?? symbol?.trim() ?? "Unknown",
    kind: identity.kind,
    logoKey: identity.logoKey,
    known: identity.known,
  };
}
