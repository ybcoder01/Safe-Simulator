import { concatHex, decodeFunctionData, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";

import type {
  Address,
  Confirmation,
  Hex,
  SafeExecutionPayload,
  SafeSnapshot,
  SafeTransaction,
} from "../../../../src/core/domain";
import {
  buildSafeExecutionRequest,
  safeExecutionAbi,
} from "../../../../src/lib/api/safe-execution";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const ownerA = "0x000000000000000000000000000000000000000a" as Address;
const ownerB = "0x000000000000000000000000000000000000000b" as Address;
const ownerC = "0x000000000000000000000000000000000000000c" as Address;
const safeTxHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

function signature(byte: string, v = "1b"): Hex {
  return `0x${byte.repeat(64)}${v}` as Hex;
}

function prevalidatedSignature(owner: Address): Hex {
  return (
    `0x${"0".repeat(24)}${owner.slice(2)}${"0".repeat(64)}01`
  ) as Hex;
}

function confirmation(owner: Address, value: Hex): Confirmation {
  return { owner, signature: value, signedAt: 1 };
}

function transaction(
  overrides: Partial<SafeTransaction> = {},
): SafeTransaction {
  return {
    safe: { chainId: 50, address: safe },
    safeTxHash,
    nonce: 7n,
    to: target,
    value: 3n,
    data: "0x12345678",
    operation: "delegatecall",
    status: "pending",
    confirmations: [],
    proposedAt: 1,
    executedAt: null,
    executedTxHash: null,
    blockNumber: null,
    blockHash: null,
    ...overrides,
  };
}

function payload(
  confirmations: readonly Confirmation[],
  overrides: Partial<SafeExecutionPayload> = {},
): SafeExecutionPayload {
  return {
    safe: { chainId: 50, address: safe },
    safeTxHash,
    nonce: 7n,
    to: target,
    value: 3n,
    data: "0x12345678",
    operation: "delegatecall",
    safeTxGas: 100n,
    baseGas: 200n,
    gasPrice: 300n,
    gasToken: null,
    refundReceiver: null,
    confirmations,
    ...overrides,
  };
}

function snapshot(overrides: Partial<SafeSnapshot> = {}): SafeSnapshot {
  return {
    chainId: 50,
    address: safe,
    owners: [ownerA, ownerB, ownerC],
    threshold: 2,
    nonce: 7n,
    version: "1.4.1",
    guard: null,
    modules: [],
    implementation: null,
    observedAt: 1,
    ...overrides,
  };
}

describe("buildSafeExecutionRequest", () => {
  it("encodes the exact Safe payload with threshold owner signatures sorted by owner", () => {
    const signatureA = signature("11");
    const signatureB = signature("22");
    const result = buildSafeExecutionRequest(
      transaction(),
      payload([
        confirmation(ownerB, signatureB),
        confirmation(ownerA, signatureA),
      ]),
      snapshot(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.request).toMatchObject({
      from: ownerA,
      to: safe,
      value: 0n,
    });
    expect(result.signerCount).toBe(2);
    expect(result.threshold).toBe(2);

    const decoded = decodeFunctionData({
      abi: safeExecutionAbi,
      data: result.request.data,
    });
    expect(decoded.functionName).toBe("execTransaction");
    expect(decoded.args).toEqual([
      target,
      3n,
      "0x12345678",
      1,
      100n,
      200n,
      300n,
      zeroAddress,
      zeroAddress,
      concatHex([signatureA, signatureB]),
    ]);
  });

  it("uses a prevalidated signature owner as the read-only caller", () => {
    const prevalidated = prevalidatedSignature(ownerB);
    const result = buildSafeExecutionRequest(
      transaction(),
      payload([
        confirmation(ownerA, signature("11")),
        confirmation(ownerB, prevalidated),
      ]),
      snapshot(),
    );

    expect(result).toMatchObject({
      ok: true,
      request: { from: ownerB },
    });
  });

  it("rejects a live payload that differs from the stored transaction", () => {
    const result = buildSafeExecutionRequest(
      transaction(),
      payload(
        [
          confirmation(ownerA, signature("11")),
          confirmation(ownerB, signature("22")),
        ],
        { value: 4n },
      ),
      snapshot(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining("does not match"),
    });
  });

  it("requires the transaction to be executable at the current nonce", () => {
    const result = buildSafeExecutionRequest(
      transaction(),
      payload([
        confirmation(ownerA, signature("11")),
        confirmation(ownerB, signature("22")),
      ]),
      snapshot({ nonce: 6n }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining("next executable nonce"),
    });
  });

  it("rejects non-owner, dynamic, and contract-signature heads rather than approximating", () => {
    const dynamicSignature = `0x${"33".repeat(96)}` as Hex;
    const contractHead = signature("44", "00");
    const result = buildSafeExecutionRequest(
      transaction(),
      payload([
        confirmation(ownerA, dynamicSignature),
        confirmation(ownerB, contractHead),
        confirmation(ownerC, signature("55", "01")),
        confirmation(
          "0x0000000000000000000000000000000000000099" as Address,
          signature("55"),
        ),
      ]),
      snapshot(),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringContaining("current threshold"),
    });
  });
});
