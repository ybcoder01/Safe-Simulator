import type {
  Address,
  Hex,
  SafeTransaction,
} from "../../src/core/domain";

export const IMPORTED_XDC_SAFE =
  "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173" as Address;
export const FIXTURE_TOKEN =
  "0x2222222222222222222222222222222222222222" as Address;
export const FIXTURE_SPENDER =
  "0x941acf4e2df51bf43c3c4167631dbefa268bc9d7" as Address;
export const UNKNOWN_DELEGATE_TARGET =
  "0x3333333333333333333333333333333333333333" as Address;

const FIXTURE_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

function word(value: bigint | Address): string {
  const body =
    typeof value === "bigint"
      ? value.toString(16)
      : value.toLowerCase().slice(2);
  return body.padStart(64, "0");
}

export function approvalCalldata(amount: bigint): Hex {
  return `0x095ea7b3${word(FIXTURE_SPENDER)}${word(amount)}` as Hex;
}

export function approvalTransaction(amount: bigint): SafeTransaction {
  return {
    safe: { chainId: 50, address: IMPORTED_XDC_SAFE },
    safeTxHash: FIXTURE_HASH,
    nonce: 0n,
    to: FIXTURE_TOKEN,
    value: 0n,
    data: approvalCalldata(amount),
    operation: "call",
    status: "executed",
    confirmations: [],
    proposedAt: 1,
    executedAt: 2,
    executedTxHash: FIXTURE_HASH,
    blockNumber: 1n,
    blockHash: FIXTURE_HASH,
  };
}
