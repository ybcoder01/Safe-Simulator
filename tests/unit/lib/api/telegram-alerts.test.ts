import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  AnalysisResult,
  Hex,
  SafeSnapshot,
  SafeTransaction,
} from "../../../../src/core/domain";
import {
  formatTelegramAlert,
  runTelegramAlertJob,
  runTelegramWatchJob,
  telegramAlertEventKey,
} from "../../../../src/lib/api/telegram-alerts";

const safe = {
  chainId: 50,
  address: "0x1111111111111111111111111111111111111111" as Address,
};
const hash = `0x${"a".repeat(64)}` as Hex;
const owner = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;
const secondOwner = "0x5555555555555555555555555555555555555555" as Address;
const thirdOwner = "0x6666666666666666666666666666666666666666" as Address;

const currentSnapshot: SafeSnapshot = {
  ...safe,
  owners: [owner, secondOwner, thirdOwner],
  threshold: 2,
  nonce: 9n,
  version: "1.4.1",
  guard: null,
  modules: [],
  implementation: null,
  observedAt: 300,
};

function transaction(
  confirmations = 1,
  overrides: Partial<SafeTransaction> = {},
): SafeTransaction {
  return {
    safe,
    safeTxHash: hash,
    nonce: 8n,
    to: "0x4444444444444444444444444444444444444444",
    value: 0n,
    data: "0x095ea7b3",
    operation: "call",
    status: "pending",
    confirmations: confirmations
      ? [{ owner, signature: "0x01", signedAt: 100 }]
      : [],
    proposedAt: 100,
    executedAt: null,
    executedTxHash: null,
    blockNumber: null,
    blockHash: null,
    ...overrides,
  };
}

const analysis: AnalysisResult = {
  safeTxHash: hash,
  engineVersion: "test",
  verdict: "flagged",
  findings: [
    {
      code: "new-approval-spender",
      severity: "critical",
      title: "A new wallet can spend this token",
      detail: "Review it.",
      addresses: [spender],
    },
  ],
  simulation: null,
  createdAt: 100,
  immutable: false,
};

describe("Telegram transaction alerts", () => {
  it("shows canonical addresses, signers, threshold urgency, and warnings", () => {
    const text = formatTelegramAlert(transaction(), 1, analysis);

    expect(text).toContain("🔴 DO NOT SIGN YET");
    expect(text).toContain("threshold reached");
    expect(text).toContain(owner.toLowerCase());
    expect(text).toContain(spender);
    expect(text).toContain("0x4444444444444444444444444444444444444444");
    expect(text).toContain("Nonce: 8");
    expect(text).toContain("Native value: 0 wei");
    expect(text).toContain("Telegram is notification-only");
  });

  it("changes its delivery key when a signer or status changes", () => {
    const first = telegramAlertEventKey(transaction(), analysis);
    const executed = { ...transaction(), status: "executed" as const };

    expect(telegramAlertEventKey(executed, analysis)).not.toBe(first);
    expect(telegramAlertEventKey(transaction(), analysis)).toBe(first);
  });

  it("does not alert on an old zero-signature proposal but keeps watching", async () => {
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job" });
    const upsertSafe = vi.fn().mockResolvedValue(undefined);
    const upsertTransactions = vi.fn().mockResolvedValue(undefined);
    const result = await runTelegramWatchJob(
      { type: "telegram-watch", safe },
      {
        chain: { getSafeSnapshot: vi.fn().mockResolvedValue(currentSnapshot) },
        persistence: {
          listTelegramSubscriptions: vi.fn().mockResolvedValue([
            {
              id: "sub",
              profileId: "p",
              safe,
              chatId: "1",
              enabled: true,
              createdAt: 200,
            },
          ]),
          findTransaction: vi.fn().mockResolvedValue(null),
          upsertSafe,
          upsertTransactions,
        },
        queue: { enqueue },
        safeData: {
          listMultisigTransactions: vi.fn().mockResolvedValue({
            items: [transaction(0)],
            nextCursor: null,
            total: 1,
          }),
        },
        now: () => 300,
      },
    );

    expect(result).toEqual({ status: "watching", changes: 0 });
    expect(upsertSafe).toHaveBeenCalledWith(currentSnapshot);
    expect(upsertTransactions).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0]?.[0]).toEqual({
      type: "telegram-watch",
      safe,
    });
  });

  it("saves a signed receipt before sending a verification-only alert", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    process.env.ALERT_SIGNING_PRIVATE_KEY = privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64");
    process.env.ALERT_SIGNING_KEY_ID = "test-key";
    process.env.ALERT_SIGNING_PUBLIC_KEYS = JSON.stringify({
      "test-key": publicKey
        .export({ format: "der", type: "spki" })
        .toString("base64"),
    });
    const saveTelegramAlertReceipt = vi.fn().mockResolvedValue(undefined);
    const upsertSafe = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const completeTelegramDelivery = vi.fn().mockResolvedValue(undefined);

    try {
      const result = await runTelegramAlertJob(
        {
          type: "telegram-alert",
          safe,
          safeTxHash: hash,
          attempt: 0,
        },
        {
          chain: {
            getSafeSnapshot: vi.fn().mockResolvedValue(currentSnapshot),
          },
          persistence: {
            findTransaction: vi.fn().mockResolvedValue(transaction()),
            findSafe: vi.fn().mockResolvedValue({
              ...safe,
              owners: [owner],
              threshold: 1,
              nonce: 9n,
              version: "1.4.1",
              guard: null,
              modules: [],
              implementation: null,
              observedAt: 100,
            }),
            findAnalysis: vi.fn().mockResolvedValue(analysis),
            listTelegramSubscriptions: vi.fn().mockResolvedValue([
              {
                id: "subscription",
                profileId: "profile",
                safe,
                chatId: "chat",
                enabled: true,
                createdAt: 50,
              },
            ]),
            claimTelegramDelivery: vi.fn().mockResolvedValue("delivery"),
            saveTelegramAlertReceipt,
            completeTelegramDelivery,
            releaseTelegramDelivery: vi.fn().mockResolvedValue(undefined),
            upsertSafe,
          },
          queue: { enqueue: vi.fn().mockResolvedValue({ jobId: "job" }) },
          telegram: { sendMessage },
          now: () => 300,
          appUrl: "https://safe.example",
        },
      );

      expect(result).toEqual({ status: "complete", sent: 1 });
      expect(saveTelegramAlertReceipt).toHaveBeenCalledOnce();
      const receipt = saveTelegramAlertReceipt.mock.calls[0]?.[1];
      expect(receipt.payload.safeTxHash).toBe(hash);
      expect(receipt.payload.threshold).toBe(2);
      expect(upsertSafe).toHaveBeenCalledWith(currentSnapshot);
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chatId: "chat",
          verificationUrl: `https://safe.example/alerts/verify/${receipt.payload.verificationId}`,
        }),
      );
      expect(saveTelegramAlertReceipt.mock.invocationCallOrder[0]).toBeLessThan(
        sendMessage.mock.invocationCallOrder[0] ?? 0,
      );
      expect(sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
        completeTelegramDelivery.mock.invocationCallOrder[0] ?? 0,
      );
    } finally {
      delete process.env.ALERT_SIGNING_PRIVATE_KEY;
      delete process.env.ALERT_SIGNING_PUBLIC_KEYS;
      delete process.env.ALERT_SIGNING_KEY_ID;
    }
  });

  it("uses the pre-execution threshold for an executed transaction", async () => {
    const historicalSnapshot: SafeSnapshot = {
      ...currentSnapshot,
      owners: [owner],
      threshold: 1,
      nonce: 8n,
      observedAt: 200,
    };
    const getSafeSnapshot = vi
      .fn()
      .mockResolvedValueOnce(currentSnapshot)
      .mockResolvedValueOnce(historicalSnapshot);
    const upsertSafe = vi.fn().mockResolvedValue(undefined);

    const result = await runTelegramAlertJob(
      {
        type: "telegram-alert",
        safe,
        safeTxHash: hash,
        attempt: 0,
      },
      {
        chain: { getSafeSnapshot },
        persistence: {
          findTransaction: vi.fn().mockResolvedValue(
            transaction(1, {
              status: "executed",
              executedAt: 250,
              executedTxHash: `0x${"b".repeat(64)}` as Hex,
              blockNumber: 100n,
              blockHash: `0x${"c".repeat(64)}` as Hex,
            }),
          ),
          findSafe: vi.fn().mockResolvedValue(currentSnapshot),
          findAnalysis: vi.fn().mockResolvedValue(analysis),
          listTelegramSubscriptions: vi.fn().mockResolvedValue([]),
          claimTelegramDelivery: vi.fn(),
          saveTelegramAlertReceipt: vi.fn(),
          completeTelegramDelivery: vi.fn(),
          releaseTelegramDelivery: vi.fn(),
          upsertSafe,
        },
        queue: { enqueue: vi.fn() },
        telegram: { sendMessage: vi.fn() },
        now: () => 300,
        appUrl: "https://safe.example",
      },
    );

    expect(result).toEqual({ status: "complete", sent: 0 });
    expect(getSafeSnapshot).toHaveBeenNthCalledWith(1, safe);
    expect(getSafeSnapshot).toHaveBeenNthCalledWith(2, safe, 99n);
    expect(upsertSafe).toHaveBeenCalledWith(currentSnapshot);
  });
});
