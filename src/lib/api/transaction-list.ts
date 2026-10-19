import { getAddress } from "viem";

import type { TokenAmountDisplay } from "@/core/analysis/decoding/calldata";
import { findTokenRegistryEntry } from "@/core/analysis/trust/token-registry";
import type {
  Address,
  AnalysisResult,
  SafeRef,
  SafeTransaction,
} from "@/core/domain";
import type { CachePort, ChainPort, PersistencePort } from "@/core/ports";
import {
  toTransactionView,
  type TransactionAnalysisView,
  type TransactionView,
} from "@/lib/api/safe-details";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/analysis-version";
import { resolveTokenMetadata } from "@/lib/api/token-metadata";

const TOKEN_AMOUNT_SELECTORS = new Set([
  "0x095ea7b3",
  "0xa9059cbb",
  "0x23b872dd",
]);

interface TokenMetadataPorts {
  readonly chain: Pick<ChainPort, "call">;
  readonly cache: Pick<CachePort, "get" | "set">;
}

function tokenTarget(transaction: SafeTransaction): Address | null {
  return TOKEN_AMOUNT_SELECTORS.has(transaction.data.slice(0, 10).toLowerCase())
    ? getAddress(transaction.to)
    : null;
}

async function resolveListTokenDisplays(
  safe: SafeRef,
  transactions: readonly SafeTransaction[],
  ports: TokenMetadataPorts | null,
): Promise<ReadonlyMap<string, TokenAmountDisplay>> {
  const targets = [
    ...new Map(
      transactions.flatMap((transaction) => {
        const target = tokenTarget(transaction);
        return target ? [[target.toLowerCase(), target] as const] : [];
      }),
    ).values(),
  ];
  const displays = new Map<string, TokenAmountDisplay>();
  const unresolved: Address[] = [];

  for (const target of targets) {
    const reviewed = findTokenRegistryEntry(safe.chainId, target);
    if (reviewed) {
      displays.set(target.toLowerCase(), {
        decimals: reviewed.decimals,
        symbol: reviewed.symbol,
      });
    } else {
      unresolved.push(target);
    }
  }

  if (!ports || unresolved.length === 0) return displays;

  const metadata = await resolveTokenMetadata(ports.chain, ports.cache, {
    chainId: safe.chainId,
    tokens: unresolved,
    blockNumber: null,
    blockHash: null,
  }).catch(() => null);
  for (const item of metadata?.items ?? []) {
    if (item.decimals !== null && item.symbol) {
      displays.set(item.token.toLowerCase(), {
        decimals: item.decimals,
        symbol: item.symbol,
      });
    }
  }
  return displays;
}

function toAnalysisView(result: AnalysisResult): TransactionAnalysisView {
  return {
    baselineVerdict: result.verdict,
    analyzedAt: result.createdAt,
    immutable: result.immutable,
  };
}

export async function resolveTransactionViews(
  persistence: Pick<PersistencePort, "findAnalyses">,
  safe: SafeRef,
  transactions: readonly SafeTransaction[],
  tokenMetadataPorts: TokenMetadataPorts | null = null,
): Promise<readonly TransactionView[]> {
  if (transactions.length === 0) return [];

  const analyses = await persistence.findAnalyses(
    safe,
    transactions.map((transaction) => transaction.safeTxHash),
    TRANSACTION_ANALYSIS_ENGINE_VERSION,
  );
  const byHash = new Map(
    analyses.map((analysis) => [
      analysis.safeTxHash.toLowerCase(),
      toAnalysisView(analysis),
    ]),
  );
  const tokenDisplays = await resolveListTokenDisplays(
    safe,
    transactions,
    tokenMetadataPorts,
  );

  return transactions.map((transaction) => {
    const target = tokenTarget(transaction);
    const token = target
      ? (tokenDisplays.get(target.toLowerCase()) ?? "unavailable")
      : null;
    return toTransactionView(
      transaction,
      byHash.get(transaction.safeTxHash.toLowerCase()) ?? null,
      token,
    );
  });
}
