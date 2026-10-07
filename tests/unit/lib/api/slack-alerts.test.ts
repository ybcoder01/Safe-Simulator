import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  AnalysisResult,
  Hex,
  SafeSnapshot,
  SafeTransaction,
} from "../../../../src/core/domain";
import { runSlackAlertJob } from "../../../../src/lib/api/slack-alerts";

const safe = {
  chainId: 50,
  address: "0x1111111111111111111111111111111111111111" as Address,
};
const hash = `0x${"a".repeat(64)}` as Hex;
const owner = "0x2222222222222222222222222222222222222222" as Address;

const snapshot: SafeSnapshot = {
  ...safe,
  owners: [owner],
  threshold: 1,
  nonce: 9n,
  version: "1.4.1",
  guard: null,
  modules: [],
  implementation: null,
  observedAt: 300,
};

const transaction: SafeTransaction = {
  safe,
  safeTxHash: hash,
  nonce: 8n,
  to: "0x4444444444444444444444444444444444444444",
  value: 0n,
  data: "0x095ea7b3",
  operation: "call",
  status: "pending",
  confirmations: [{ owner, signature: "0x01", signedAt: 100 }],
  proposedAt: 100,
  executedAt: null,
  executedTxHash: null,
  blockNumber: null,
  blockHash: null,
};

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
      addresses: [],
    },
  ],
  simulation: null,
  createdAt: 100,
  immutable: false,
};

describe("Slack transaction alerts", () => {
  it("stores a signed receipt before sending and completes delivery afterward", async () => {
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
    const saveSlackAlertReceipt = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const completeSlackDelivery = vi.fn().mockResolvedValue(undefined);

    try {
      const result = await runSlackAlertJob(
        { type: "slack-alert", safe, safeTxHash: hash, attempt: 0 },
        {
          chain: { getSafeSnapshot: vi.fn().mockResolvedValue(snapshot) },
          persistence: {
            findTransaction: vi.fn().mockResolvedValue(transaction),
            findSafe: vi.fn().mockResolvedValue(snapshot),
            findAnalysis: vi.fn().mockResolvedValue(analysis),
            listSlackSubscriptions: vi.fn().mockResolvedValue([
              {
                id: "subscription",
                profileId: "profile",
                safe,
                teamId: "T123",
                channelId: "C123",
                channelLabel: "#signers",
                enabled: true,
                disconnectedAt: null,
                lastPolledAt: null,
                lastPollError: null,
                lastDeliveryAttemptAt: null,
                lastDeliveryError: null,
                createdAt: 50,
              },
            ]),
            claimSlackDelivery: vi.fn().mockResolvedValue("delivery"),
            saveSlackAlertReceipt,
            completeSlackDelivery,
            recordSlackDeliveryResult: vi.fn().mockResolvedValue(undefined),
            releaseSlackDelivery: vi.fn().mockResolvedValue(undefined),
            upsertSafe: vi.fn().mockResolvedValue(undefined),
          },
          queue: { enqueue: vi.fn().mockResolvedValue({ jobId: "job" }) },
          slack: { sendMessage },
          now: () => 300,
          appUrl: "https://safe.example",
        },
      );

      expect(result).toEqual({ status: "complete", sent: 1 });
      const receipt = saveSlackAlertReceipt.mock.calls[0]?.[1];
      expect(receipt.payload.threshold).toBe(1);
      expect(sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channelId: "C123",
          verificationUrl: `https://safe.example/alerts/verify/${receipt.payload.verificationId}`,
        }),
      );
      expect(saveSlackAlertReceipt.mock.invocationCallOrder[0]).toBeLessThan(
        sendMessage.mock.invocationCallOrder[0] ?? 0,
      );
      expect(sendMessage.mock.invocationCallOrder[0]).toBeLessThan(
        completeSlackDelivery.mock.invocationCallOrder[0] ?? 0,
      );
    } finally {
      delete process.env.ALERT_SIGNING_PRIVATE_KEY;
      delete process.env.ALERT_SIGNING_PUBLIC_KEYS;
      delete process.env.ALERT_SIGNING_KEY_ID;
    }
  });

  it("does not send the same event twice when delivery was already claimed", async () => {
    const sendMessage = vi.fn();
    const result = await runSlackAlertJob(
      { type: "slack-alert", safe, safeTxHash: hash, attempt: 0 },
      {
        chain: { getSafeSnapshot: vi.fn().mockResolvedValue(snapshot) },
        persistence: {
          findTransaction: vi.fn().mockResolvedValue(transaction),
          findSafe: vi.fn().mockResolvedValue(snapshot),
          findAnalysis: vi.fn().mockResolvedValue(analysis),
          listSlackSubscriptions: vi.fn().mockResolvedValue([
            {
              id: "subscription",
              profileId: "profile",
              safe,
              teamId: "T123",
              channelId: "C123",
              channelLabel: "#signers",
              enabled: true,
              disconnectedAt: null,
              lastPolledAt: null,
              lastPollError: null,
              lastDeliveryAttemptAt: null,
              lastDeliveryError: null,
              createdAt: 50,
            },
          ]),
          claimSlackDelivery: vi.fn().mockResolvedValue(null),
          saveSlackAlertReceipt: vi.fn(),
          completeSlackDelivery: vi.fn(),
          recordSlackDeliveryResult: vi.fn(),
          releaseSlackDelivery: vi.fn(),
          upsertSafe: vi.fn().mockResolvedValue(undefined),
        },
        queue: { enqueue: vi.fn() },
        slack: { sendMessage },
        now: () => 300,
        appUrl: "https://safe.example",
      },
    );

    expect(result).toEqual({ status: "complete", sent: 0 });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
