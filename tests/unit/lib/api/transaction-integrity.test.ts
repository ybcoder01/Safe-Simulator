import { describe, expect, it } from "vitest";

import type {
  Address,
  Hex,
  SafeExecutionPayload,
  SafeTransaction,
} from "../../../../src/core/domain";
import {
  computeSafeTransactionHash,
  findCompetingProposals,
  transactionReviewFreshness,
  verifySafeTransactionHash,
} from "../../../../src/lib/api/transaction-integrity";

const safe = "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173" as Address;
const target = "0x70d8005e3c8c7e383fe35fa40156042f3393449f" as Address;
const knownHash =
  "0xd424ea5162581bd8a8d34ed799f435629ae6be98d2e951443d8f33453c6d1640" as Hex;

const payload: SafeExecutionPayload = {
  safe: { chainId: 50, address: safe },
  safeTxHash: knownHash,
  nonce: 48n,
  to: target,
  value: 0n,
  data: "0x617ba037000000000000000000000000fa2958cb79b0491cc627c1557f441ef849ca8eb1000000000000000000000000000000000000000000000000000000000000c350000000000000000000000000c8bae80ca5c2c9ec3bd4ac16c422220a33b6b1730000000000000000000000000000000000000000000000000000000000000000",
  operation: "call",
  safeTxGas: 0n,
  baseGas: 0n,
  gasPrice: 0n,
  gasToken: null,
  refundReceiver: null,
  confirmations: [],
};

function transaction(
  safeTxHash: Hex,
  overrides: Partial<SafeTransaction> = {},
): SafeTransaction {
  return {
    safe: payload.safe,
    safeTxHash,
    nonce: payload.nonce,
    to: payload.to,
    value: payload.value,
    data: payload.data,
    operation: payload.operation,
    status: "pending",
    confirmations: [],
    proposedAt: 100,
    executedAt: null,
    executedTxHash: null,
    blockNumber: null,
    blockHash: null,
    ...overrides,
  };
}

describe("transaction integrity", () => {
  it("recomputes a real XDC Safe transaction hash independently", () => {
    expect(computeSafeTransactionHash(payload)).toBe(knownHash);
    expect(verifySafeTransactionHash(payload, knownHash)).toMatchObject({
      status: "verified",
      computedHash: knownHash,
    });
  });

  it("detects a supplied hash that does not describe the payload", () => {
    const suppliedHash = `0x${"a".repeat(64)}` as Hex;
    expect(verifySafeTransactionHash(payload, suppliedHash)).toMatchObject({
      status: "mismatch",
      suppliedHash,
      computedHash: knownHash,
    });
  });

  it("shows field-level differences for competing proposals at one nonce", () => {
    const current = transaction(knownHash);
    const otherHash = `0x${"b".repeat(64)}` as Hex;
    const result = findCompetingProposals(current, [
      current,
      transaction(otherHash, {
        to: "0x2222222222222222222222222222222222222222",
        value: 9n,
        data: "0x1234",
        operation: "delegatecall",
        proposedAt: 200,
      }),
      transaction(`0x${"c".repeat(64)}` as Hex, { nonce: 49n }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.safeTxHash).toBe(otherHash);
    expect(result[0]?.differences.map((item) => item.field)).toEqual([
      "target",
      "value",
      "calldata",
      "operation",
    ]);
  });

  it("expires a review after its bounded freshness window", () => {
    expect(transactionReviewFreshness(1_000, 1_299)).toMatchObject({
      status: "fresh",
      expiresAt: 1_300,
    });
    expect(transactionReviewFreshness(1_000, 1_301)).toMatchObject({
      status: "expired",
      expiresAt: 1_300,
    });
  });
});
