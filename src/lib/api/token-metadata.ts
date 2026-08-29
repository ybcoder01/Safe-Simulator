import {
  decodeTokenDecimals,
  decodeTokenSymbol,
  ERC20_DECIMALS_SELECTOR,
  ERC20_SYMBOL_SELECTOR,
  MAX_DISPLAY_DECIMALS,
} from "@/core/analysis/tokens/metadata";
import type { Address, ChainId, Hex } from "@/core/domain";
import type { CachePort, ChainPort } from "@/core/ports";
import type { ExecutionInsight } from "@/lib/api/execution-insight";

export interface TokenMetadataView {
  readonly token: Address;
  readonly status: "resolved" | "partial" | "malformed" | "unavailable";
  readonly symbol: string | null;
  readonly decimals: number | null;
  readonly warning: string | null;
}

export interface TokenMetadataResult {
  readonly items: readonly TokenMetadataView[];
  readonly totalTokens: number;
  readonly limited: boolean;
  readonly blockHash: Hex | null;
}

interface TokenMetadataRequest {
  readonly chainId: ChainId;
  readonly tokens: readonly Address[];
  readonly blockNumber: bigint | null;
  readonly blockHash: Hex | null;
}

const TOKEN_METADATA_VERSION = "token-metadata-v1";
const LATEST_METADATA_TTL_SECONDS = 3_600;
const MAX_TOKENS_PER_REQUEST = 24;

function cacheKey(
  chainId: ChainId,
  token: Address,
  blockHash: Hex | null,
): string {
  return [
    TOKEN_METADATA_VERSION,
    chainId,
    token.toLowerCase(),
    blockHash?.toLowerCase() ?? "latest",
  ].join(":");
}

function isMetadataView(value: unknown, token: Address): value is TokenMetadataView {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<TokenMetadataView>;
  return (
    candidate.token?.toLowerCase() === token.toLowerCase() &&
    (candidate.status === "resolved" ||
      candidate.status === "partial" ||
      candidate.status === "malformed") &&
    (candidate.symbol === null || typeof candidate.symbol === "string") &&
    (candidate.decimals === null || typeof candidate.decimals === "number") &&
    (candidate.warning === null || typeof candidate.warning === "string")
  );
}

async function cachedMetadata(
  cache: Pick<CachePort, "get">,
  key: string,
  token: Address,
): Promise<TokenMetadataView | null> {
  try {
    const value = await cache.get<TokenMetadataView>(key);
    return isMetadataView(value, token) ? value : null;
  } catch {
    return null;
  }
}

async function readMetadata(
  chain: Pick<ChainPort, "call">,
  request: TokenMetadataRequest,
  token: Address,
): Promise<TokenMetadataView> {
  const [decimalsResult, symbolResult] = await Promise.allSettled([
    chain.call(
      request.chainId,
      { to: token, data: ERC20_DECIMALS_SELECTOR },
      request.blockNumber ?? undefined,
    ),
    chain.call(
      request.chainId,
      { to: token, data: ERC20_SYMBOL_SELECTOR },
      request.blockNumber ?? undefined,
    ),
  ]);

  const decimals =
    decimalsResult.status === "fulfilled"
      ? decodeTokenDecimals(decimalsResult.value)
      : null;
  const symbol =
    symbolResult.status === "fulfilled"
      ? decodeTokenSymbol(symbolResult.value)
      : null;
  const decimalsMalformed =
    decimalsResult.status === "fulfilled" &&
    (decimals === null || decimals > MAX_DISPLAY_DECIMALS);
  const symbolMalformed =
    symbolResult.status === "fulfilled" && symbol === null;

  if (decimalsMalformed || symbolMalformed) {
    return {
      token,
      status: "malformed",
      symbol,
      decimals:
        decimals !== null && decimals <= MAX_DISPLAY_DECIMALS
          ? decimals
          : null,
      warning:
        "The token returned malformed or unsupported metadata; raw base units remain authoritative.",
    };
  }

  if (decimals !== null && symbol !== null) {
    return {
      token,
      status: "resolved",
      symbol,
      decimals,
      warning: null,
    };
  }

  if (decimals !== null || symbol !== null) {
    return {
      token,
      status: "partial",
      symbol,
      decimals,
      warning:
        "Only part of the token metadata could be read; raw base units remain authoritative.",
    };
  }

  return {
    token,
    status: "unavailable",
    symbol: null,
    decimals: null,
    warning:
      "Token metadata could not be read; raw base units remain authoritative.",
  };
}

async function resolveOne(
  chain: Pick<ChainPort, "call">,
  cache: Pick<CachePort, "get" | "set">,
  request: TokenMetadataRequest,
  token: Address,
): Promise<TokenMetadataView> {
  const key = cacheKey(request.chainId, token, request.blockHash);
  const cached = await cachedMetadata(cache, key, token);
  if (cached) return cached;

  const metadata = await readMetadata(chain, request, token);
  const cacheable =
    metadata.status === "resolved" || metadata.status === "malformed";
  if (cacheable) {
    try {
      await cache.set(
        key,
        metadata,
        request.blockHash === null ? LATEST_METADATA_TTL_SECONDS : null,
      );
    } catch {
      // Metadata remains usable when the cache projection is unavailable.
    }
  }
  return metadata;
}

export async function resolveTokenMetadata(
  chain: Pick<ChainPort, "call">,
  cache: Pick<CachePort, "get" | "set">,
  request: TokenMetadataRequest,
): Promise<TokenMetadataResult> {
  const unique = Array.from(
    new Map(
      request.tokens.map((token) => [token.toLowerCase(), token] as const),
    ).values(),
  );
  const selected = unique.slice(0, MAX_TOKENS_PER_REQUEST);
  const items = await Promise.all(
    selected.map((token) => resolveOne(chain, cache, request, token)),
  );

  return {
    items,
    totalTokens: unique.length,
    limited: unique.length > selected.length,
    blockHash: request.blockHash,
  };
}

export async function resolveExecutionTokenMetadata(
  chain: Pick<ChainPort, "call">,
  cache: Pick<CachePort, "get" | "set">,
  chainId: ChainId,
  execution: Pick<
    ExecutionInsight,
    | "tokenMovements"
    | "allowanceChanges"
    | "blockNumber"
    | "blockHash"
  >,
): Promise<TokenMetadataResult> {
  const tokens = [
    ...execution.tokenMovements.map(
      (movement) => movement.token as Address,
    ),
    ...execution.allowanceChanges.map(
      (allowance) => allowance.token as Address,
    ),
  ];
  let blockNumber: bigint | null = null;
  if (execution.blockNumber !== null) {
    try {
      blockNumber = BigInt(execution.blockNumber);
    } catch {
      blockNumber = null;
    }
  }

  return resolveTokenMetadata(chain, cache, {
    chainId,
    tokens,
    blockNumber,
    blockHash: execution.blockHash,
  });
}
