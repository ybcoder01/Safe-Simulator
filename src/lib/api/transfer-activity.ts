import { z } from "zod";

import { formatTokenAmount } from "@/core/analysis/tokens/metadata";
import { findTokenRegistryEntry } from "@/core/analysis/trust/token-registry";
import type { TransferRecord } from "@/core/domain";
import type { CachePort, ChainPort } from "@/core/ports";
import {
  resolveTokenMetadata,
  type TokenMetadataView,
} from "@/lib/api/token-metadata";

export const transferPageQuerySchema = z.object({
  cursor: z.string().uuid().nullable(),
  limit: z.coerce.number().int().min(1).max(100),
});

export interface TransferAmountPresentation {
  readonly displayAmount: string;
  readonly symbol: string | null;
  readonly amountSource: "native" | "reviewed" | "on-chain" | "raw";
  readonly metadataStatus: TokenMetadataView["status"] | null;
  readonly metadataWarning: string | null;
}

export function resolveTransferAmount(
  transfer: Pick<TransferRecord, "amount" | "token" | "safe">,
  metadata: TokenMetadataView | null = null,
): TransferAmountPresentation {
  const rawAmount = transfer.amount.toString();

  if (transfer.token === null) {
    return {
      displayAmount: formatTokenAmount(rawAmount, 18) ?? rawAmount,
      symbol: transfer.safe.chainId === 1 ? "ETH" : "XDC",
      amountSource: "native",
      metadataStatus: null,
      metadataWarning: null,
    };
  }

  const reviewed = findTokenRegistryEntry(
    transfer.safe.chainId,
    transfer.token,
  );
  if (reviewed) {
    return {
      displayAmount:
        formatTokenAmount(rawAmount, reviewed.decimals) ?? rawAmount,
      symbol: reviewed.symbol,
      amountSource: "reviewed",
      metadataStatus: null,
      metadataWarning: null,
    };
  }

  const matchingMetadata =
    metadata?.token.toLowerCase() === transfer.token.toLowerCase()
      ? metadata
      : null;

  if (
    matchingMetadata?.decimals !== null &&
    matchingMetadata?.decimals !== undefined
  ) {
    return {
      displayAmount:
        formatTokenAmount(rawAmount, matchingMetadata.decimals) ?? rawAmount,
      symbol: matchingMetadata.symbol,
      amountSource: "on-chain",
      metadataStatus: matchingMetadata.status,
      metadataWarning: matchingMetadata.warning,
    };
  }

  return {
    displayAmount: rawAmount,
    symbol: matchingMetadata?.symbol ?? null,
    amountSource: "raw",
    metadataStatus: matchingMetadata?.status ?? null,
    metadataWarning: matchingMetadata?.warning ?? null,
  };
}

export function toTransferView(
  transfer: TransferRecord,
  metadata: TokenMetadataView | null = null,
) {
  const safeAddress = transfer.safe.address.toLowerCase();
  const fromSafe = transfer.from.toLowerCase() === safeAddress;
  const toSafe = transfer.to.toLowerCase() === safeAddress;
  const direction = fromSafe
    ? toSafe
      ? ("self" as const)
      : ("outgoing" as const)
    : toSafe
      ? ("incoming" as const)
      : ("related" as const);
  const counterparty =
    direction === "incoming"
      ? transfer.from
      : direction === "outgoing"
        ? transfer.to
        : null;

  return {
    transactionHash: transfer.transactionHash,
    token: transfer.token,
    from: transfer.from,
    to: transfer.to,
    amount: transfer.amount.toString(),
    ...resolveTransferAmount(transfer, metadata),
    blockNumber: transfer.blockNumber.toString(),
    timestamp: transfer.timestamp,
    direction,
    counterparty,
  };
}

export type TransferView = ReturnType<typeof toTransferView>;

export async function resolveTransferViews(
  chain: Pick<ChainPort, "call">,
  cache: Pick<CachePort, "get" | "set">,
  transfers: readonly TransferRecord[],
): Promise<readonly TransferView[]> {
  const firstTransfer = transfers[0];
  if (!firstTransfer) {
    return [];
  }

  const tokens = transfers.flatMap((transfer) =>
    transfer.token === null ? [] : [transfer.token],
  );

  try {
    const metadata = await resolveTokenMetadata(chain, cache, {
      chainId: firstTransfer.safe.chainId,
      tokens,
      blockNumber: null,
      blockHash: null,
    });
    const metadataByToken = new Map(
      metadata.items.map((entry) => [entry.token.toLowerCase(), entry]),
    );

    return transfers.map((transfer) =>
      toTransferView(
        transfer,
        transfer.token === null
          ? null
          : (metadataByToken.get(transfer.token.toLowerCase()) ?? null),
      ),
    );
  } catch {
    return transfers.map((transfer) => toTransferView(transfer));
  }
}

function transferIdentity(transfer: TransferView): string {
  return [
    transfer.transactionHash,
    transfer.token ?? "native",
    transfer.from,
    transfer.to,
    transfer.amount,
  ]
    .join(":")
    .toLowerCase();
}

export function appendUniqueTransferViews(
  current: readonly TransferView[],
  incoming: readonly TransferView[],
): readonly TransferView[] {
  const known = new Set(current.map(transferIdentity));
  const merged = [...current];

  for (const transfer of incoming) {
    const key = transferIdentity(transfer);
    if (known.has(key)) continue;
    known.add(key);
    merged.push(transfer);
  }

  return merged;
}
