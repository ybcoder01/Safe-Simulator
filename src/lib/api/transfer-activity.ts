import { z } from "zod";

import type { TransferRecord } from "@/core/domain";

export const transferPageQuerySchema = z.object({
  cursor: z.string().uuid().nullable(),
  limit: z.coerce.number().int().min(1).max(100),
});

export function toTransferView(transfer: TransferRecord) {
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
    blockNumber: transfer.blockNumber.toString(),
    timestamp: transfer.timestamp,
    direction,
    counterparty,
  };
}

export type TransferView = ReturnType<typeof toTransferView>;

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
