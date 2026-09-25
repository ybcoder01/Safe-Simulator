import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  Address,
  AnalysisResult,
  Hex,
  SafeTransaction,
} from "../../../../src/core/domain";
import {
  createTelegramAlertReceipt,
  isTelegramVerificationId,
  verifyTelegramAlertReceipt,
} from "../../../../src/lib/api/telegram-alert-receipts";

const safe = {
  chainId: 50,
  address: "0x1111111111111111111111111111111111111111" as Address,
};
const safeTxHash = `0x${"a".repeat(64)}` as Hex;
const transaction: SafeTransaction = {
  safe,
  safeTxHash,
  nonce: 12n,
  to: "0x2222222222222222222222222222222222222222",
  value: 0n,
  data: "0x095ea7b3",
  operation: "call",
  status: "pending",
  confirmations: [
    {
      owner: "0x3333333333333333333333333333333333333333",
      signature: "0x01",
      signedAt: 100,
    },
  ],
  proposedAt: 100,
  executedAt: null,
  executedTxHash: null,
  blockNumber: null,
  blockHash: null,
};
const analysis: AnalysisResult = {
  safeTxHash,
  engineVersion: "test",
  verdict: "flagged",
  findings: [
    {
      code: "new-approval-spender",
      severity: "critical",
      title: "New spender",
      detail: "Review it.",
      addresses: [],
    },
  ],
  simulation: null,
  createdAt: 100,
  immutable: false,
};

describe("Telegram alert receipts", () => {
  beforeEach(() => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    process.env.ALERT_SIGNING_PRIVATE_KEY = privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64");
    process.env.ALERT_SIGNING_KEY_ID = "test-2026-01";
    process.env.ALERT_SIGNING_PUBLIC_KEYS = JSON.stringify({
      "test-2026-01": publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
    });
  });

  afterEach(() => {
    delete process.env.ALERT_SIGNING_PRIVATE_KEY;
    delete process.env.ALERT_SIGNING_PUBLIC_KEYS;
    delete process.env.ALERT_SIGNING_KEY_ID;
  });

  it("creates a verifiable receipt containing exact transaction fields", () => {
    const receipt = createTelegramAlertReceipt({
      transaction,
      threshold: 2,
      analysis,
      issuedAt: 200,
    });

    expect(isTelegramVerificationId(receipt.payload.verificationId)).toBe(true);
    expect(receipt.payload.safeAddress).toBe(safe.address);
    expect(receipt.payload.safeTxHash).toBe(safeTxHash);
    expect(receipt.payload.nonce).toBe("12");
    expect(receipt.payload.target).toBe(transaction.to);
    expect(receipt.payload.threshold).toBe(2);
    expect(receipt.payload.verdict).toBe("flagged");
    expect(receipt.payload.findingCodes).toEqual(["new-approval-spender"]);
    expect(verifyTelegramAlertReceipt(receipt)).toBe(true);
  });

  it("rejects a receipt if a saved transaction field is altered", () => {
    const receipt = createTelegramAlertReceipt({
      transaction,
      threshold: 2,
      analysis,
      issuedAt: 200,
    });

    expect(
      verifyTelegramAlertReceipt({
        ...receipt,
        payload: { ...receipt.payload, target: safe.address },
      }),
    ).toBe(false);
  });

  it("rejects a receipt signed by a different key", () => {
    const receipt = createTelegramAlertReceipt({
      transaction,
      threshold: 2,
      analysis,
      issuedAt: 200,
    });
    const { publicKey } = generateKeyPairSync("ed25519");
    process.env.ALERT_SIGNING_PUBLIC_KEYS = JSON.stringify({
      "test-2026-01": publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
    });

    expect(verifyTelegramAlertReceipt(receipt)).toBe(false);
  });
});
