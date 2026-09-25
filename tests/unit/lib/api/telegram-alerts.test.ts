import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  AnalysisResult,
  Hex,
  SafeTransaction,
} from "../../../../src/core/domain";
import {
  formatTelegramAlert,
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

function transaction(confirmations = 1): SafeTransaction {
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
  });

  it("changes its delivery key when a signer or status changes", () => {
    const first = telegramAlertEventKey(transaction(), analysis);
    const executed = { ...transaction(), status: "executed" as const };

    expect(telegramAlertEventKey(executed, analysis)).not.toBe(first);
    expect(telegramAlertEventKey(transaction(), analysis)).toBe(first);
  });

  it("does not alert on an old zero-signature proposal but keeps watching", async () => {
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job" });
    const upsertTransactions = vi.fn().mockResolvedValue(undefined);
    const result = await runTelegramWatchJob(
      { type: "telegram-watch", safe },
      {
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
    expect(upsertTransactions).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(enqueue.mock.calls[0]?.[0]).toEqual({
      type: "telegram-watch",
      safe,
    });
  });
});
