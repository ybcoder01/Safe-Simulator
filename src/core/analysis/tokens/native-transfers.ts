export interface TracedCall {
  readonly depth: number;
  readonly from: string;
  readonly to: string;
  readonly value: string;
  readonly operation: "call" | "delegatecall";
  readonly reverted: boolean;
}

export interface NativeTransfer {
  readonly from: string;
  readonly to: string;
  readonly amount: bigint;
}

function parseValue(value: string): bigint {
  return /^[0-9]+$/.test(value) ? BigInt(value) : 0n;
}

/**
 * Native coin that actually moved between accounts during execution. Token
 * events never include it, so it has to come from value-carrying calls in the
 * trace. Delegate calls only reuse their caller's value, and anything below a
 * reverted call was rolled back.
 */
export function successfulNativeTransfers(
  calls: readonly TracedCall[],
): readonly NativeTransfer[] {
  const transfers: NativeTransfer[] = [];
  let revertedDepth: number | null = null;

  for (const call of calls) {
    if (revertedDepth !== null) {
      if (call.depth > revertedDepth) continue;
      revertedDepth = null;
    }
    if (call.reverted) {
      revertedDepth = call.depth;
      continue;
    }
    if (call.operation !== "call") continue;

    const amount = parseValue(call.value);
    if (amount > 0n) {
      transfers.push({ from: call.from, to: call.to, amount });
    }
  }
  return transfers;
}

export function nativeReceivedBy(
  account: string,
  transfers: readonly NativeTransfer[],
): bigint {
  const key = account.toLowerCase();
  return transfers
    .filter(
      (transfer) =>
        transfer.to.toLowerCase() === key &&
        transfer.from.toLowerCase() !== key,
    )
    .reduce((total, transfer) => total + transfer.amount, 0n);
}
