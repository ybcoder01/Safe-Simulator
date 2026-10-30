import type {
  Address,
  AnalysisResult,
  Hex,
  SafeRef,
  SafeTransaction,
} from "@/core/domain";
import { formatTelegramAlert } from "@/lib/api/telegram-alerts";

const TRAINING_TARGET = "0x000000000000000000000000000000000000d501";
const TRAINING_RECIPIENT = "0x000000000000000000000000000000000000d502";
const TRAINING_OWNER = "0x000000000000000000000000000000000000d503";
const TRAINING_HASH = `0x${"d".repeat(64)}`;

export function formatMaliciousTrainingAlert(safe: SafeRef): string {
  const transaction: SafeTransaction = {
    safe,
    safeTxHash: TRAINING_HASH as Hex,
    nonce: 999_999n,
    to: TRAINING_TARGET as Address,
    value: 175n * 10n ** 18n,
    data: "0xdeadbeef",
    operation: "delegatecall",
    status: "pending",
    confirmations: [
      {
        owner: TRAINING_OWNER as Address,
        signature: "0x01",
        signedAt: 1,
      },
    ],
    proposedAt: 1,
    executedAt: null,
    executedTxHash: null,
    blockNumber: null,
    blockHash: null,
  };
  const analysis: AnalysisResult = {
    safeTxHash: transaction.safeTxHash,
    engineVersion: "synthetic-training-v1",
    verdict: "flagged",
    findings: [
      {
        code: "delegatecall-operation",
        severity: "critical",
        title: "Unknown code would run with the Safe’s authority",
        detail:
          "The delegated implementation is not an approved deployment and can write to Safe storage.",
        addresses: [TRAINING_TARGET as Address],
      },
      {
        code: "unexpected-recipient",
        severity: "warning",
        title: "A newly seen wallet would receive funds",
        detail:
          "The simulated recipient is not present in successful Safe history.",
        addresses: [TRAINING_RECIPIENT as Address],
      },
    ],
    simulation: null,
    createdAt: 1,
    immutable: false,
  };

  return [
    "🚨 SAFE INSPECTOR TRAINING ALERT",
    "SYNTHETIC EXAMPLE · NO ON-CHAIN TRANSACTION EXISTS",
    "",
    formatTelegramAlert(transaction, 2, analysis),
    "",
    "Training alert only. Nothing was created, proposed, signed, or executed.",
  ].join("\n");
}
