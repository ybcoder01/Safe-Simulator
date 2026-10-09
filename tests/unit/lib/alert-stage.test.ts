import { describe, expect, it } from "vitest";

import type {
  Address,
  Hex,
  SafeTransaction,
  TelegramAlertReceiptPayload,
} from "../../../src/core/domain";
import {
  alertVerdictLabel,
  buildStageTimeline,
  compareAlertStageWithCurrent,
  resolveAlertStage,
  type AlertTimelineReceipt,
} from "../../../src/lib/alert-stage";

const ownerOne = "0x11a40ae7000000000000000000000000ed39deac" as Address;
const ownerTwo = "0xfc0b8cecb52c2a9d444ba377e0f0b277f76b40da" as Address;

const proposedAt = 1_791_208_087;
const secondSignatureAt = 1_791_208_142;

function transaction(
  overrides: Partial<SafeTransaction> = {},
): Pick<
  SafeTransaction,
  "status" | "confirmations" | "proposedAt" | "executedAt"
> {
  return {
    status: "executed",
    proposedAt,
    executedAt: secondSignatureAt,
    confirmations: [
      { owner: ownerOne, signature: "0x01" as Hex, signedAt: proposedAt },
      {
        owner: ownerTwo,
        signature: "0x02" as Hex,
        signedAt: secondSignatureAt,
      },
    ],
    ...overrides,
  };
}

const preSignReceipt: AlertTimelineReceipt = {
  verificationId: "a".repeat(32),
  issuedAt: proposedAt + 14,
  status: "pending",
  signatureCount: 1,
  threshold: 2,
  verdict: "unverified",
  findingCodes: ["recipient-address-unconfirmed"],
};

function payload(
  overrides: Partial<TelegramAlertReceiptPayload> = {},
): TelegramAlertReceiptPayload {
  return {
    version: 1,
    verificationId: "a".repeat(32),
    issuedAt: proposedAt + 14,
    chainId: 50,
    safeAddress: "0xdb9faced3efde6f6b17296644adfafb28e4e2d23" as Address,
    safeTxHash: `0x${"3".repeat(64)}` as Hex,
    nonce: "44",
    target: "0x4fff70c17fb974121a1ad64c97b04a2e38dbfe7c" as Address,
    value: "0",
    calldata: "0x" as Hex,
    operation: "call",
    status: "pending",
    signerAddresses: [ownerOne],
    threshold: 2,
    verdict: "unverified",
    findingCodes: ["internal-delegatecall"],
    ...overrides,
  };
}

describe("alert stages", () => {
  it("names the moment before the last signature", () => {
    expect(
      resolveAlertStage({ status: "pending", signatureCount: 1, threshold: 2 }),
    ).toMatchObject({
      id: "collecting-signatures",
      label: "Waiting for the last signature (1 of 2 signed)",
      open: true,
    });
  });

  it("treats a fully signed pending transaction as ready, still open", () => {
    expect(
      resolveAlertStage({ status: "pending", signatureCount: 2, threshold: 2 }),
    ).toMatchObject({ id: "ready-to-execute", open: true });
  });

  it("closes the stage once the transaction concludes", () => {
    for (const status of ["executed", "failed", "replaced"] as const) {
      expect(
        resolveAlertStage({ status, signatureCount: 2, threshold: 2 }).open,
      ).toBe(false);
    }
  });
});

describe("alertVerdictLabel", () => {
  it("keeps the original pre-sign wording for alerts sent before execution", () => {
    expect(alertVerdictLabel("flagged", "pending")).toBe(
      "Danger signal found — do not sign yet",
    );
  });

  it("never tells signers not to sign for an alert about an executed transaction", () => {
    for (const verdict of [
      "flagged",
      "unverified",
      "known",
      "trusted",
    ] as const) {
      expect(alertVerdictLabel(verdict, "executed")).not.toMatch(
        /do not sign|review manually/i,
      );
    }
  });
});

describe("buildStageTimeline", () => {
  it("keeps the pre-sign alert on its own stage and ends at the executed state", () => {
    const entries = buildStageTimeline({
      transaction: transaction(),
      threshold: 2,
      receipts: [preSignReceipt],
    });

    expect(entries.map((entry) => entry.key)).toEqual([
      "pending:1",
      "executed",
    ]);
    expect(entries[0]).toMatchObject({
      alert: { verdict: "unverified" },
      current: false,
    });
    expect(entries[0]?.stage.label).toBe(
      "Waiting for the last signature (1 of 2 signed)",
    );
    expect(entries[1]).toMatchObject({
      current: true,
      alert: null,
      at: secondSignatureAt,
    });
  });

  it("still shows the ready stage when an alert was sent at it", () => {
    const readyReceipt: AlertTimelineReceipt = {
      ...preSignReceipt,
      verificationId: "c".repeat(32),
      issuedAt: secondSignatureAt + 2,
      signatureCount: 2,
    };
    const entries = buildStageTimeline({
      transaction: transaction(),
      threshold: 2,
      receipts: [preSignReceipt, readyReceipt],
    });
    expect(entries.map((entry) => entry.key)).toEqual([
      "pending:1",
      "pending:2",
      "executed",
    ]);
    expect(entries[1]?.alert).toBe(readyReceipt);
  });

  it("attaches a later executed alert to the executed stage without moving the earlier one", () => {
    const executedReceipt: AlertTimelineReceipt = {
      ...preSignReceipt,
      verificationId: "b".repeat(32),
      issuedAt: secondSignatureAt + 20,
      status: "executed",
      signatureCount: 2,
    };
    const entries = buildStageTimeline({
      transaction: transaction(),
      threshold: 2,
      receipts: [executedReceipt, preSignReceipt],
    });

    expect(entries.find((e) => e.key === "pending:1")?.alert).toBe(
      preSignReceipt,
    );
    expect(entries.find((e) => e.key === "executed")?.alert).toBe(
      executedReceipt,
    );
  });

  it("keeps the first alert when a stage was alerted twice", () => {
    const duplicate = { ...preSignReceipt, issuedAt: proposedAt + 60 };
    const entries = buildStageTimeline({
      transaction: transaction(),
      threshold: 2,
      receipts: [duplicate, preSignReceipt],
    });
    expect(entries[0]?.alert).toBe(preSignReceipt);
  });

  it("keeps a pending transaction open with the latest stage marked current", () => {
    const entries = buildStageTimeline({
      transaction: transaction({
        status: "pending",
        executedAt: null,
        confirmations: [
          { owner: ownerOne, signature: "0x01" as Hex, signedAt: proposedAt },
        ],
      }),
      threshold: 2,
      receipts: [preSignReceipt],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ current: true });
    expect(entries[0]?.stage.open).toBe(true);
  });
});

describe("compareAlertStageWithCurrent", () => {
  it("explains that a pre-sign alert is from an earlier stage of an executed transaction", () => {
    const result = compareAlertStageWithCurrent(payload(), transaction());

    expect(result.changed).toBe(true);
    expect(result.headline).toBe("This transaction has since executed");
    expect(result.then.label).toBe(
      "Waiting for the last signature (1 of 2 signed)",
    );
    expect(result.now?.label).toBe("Executed");
    expect(result.explanation).toContain("kept exactly as they were");
  });

  it("reports no change while the transaction is still at the alerted stage", () => {
    const result = compareAlertStageWithCurrent(
      payload(),
      transaction({
        status: "pending",
        confirmations: [
          { owner: ownerOne, signature: "0x01" as Hex, signedAt: proposedAt },
        ],
      }),
    );
    expect(result.changed).toBe(false);
    expect(result.headline).toBe("Nothing has changed since this alert");
  });

  it("does not claim a change when the current state cannot be loaded", () => {
    const result = compareAlertStageWithCurrent(payload(), null);
    expect(result).toMatchObject({ changed: false, now: null });
    expect(result.headline).toBe("Current status unavailable");
  });
});
