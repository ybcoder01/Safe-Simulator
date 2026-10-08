import { describe, expect, it } from "vitest";

import type { TransactionActivity } from "../../../src/core/analysis/decoding/activity";
import type {
  Address,
  Hex,
  SafeTransaction,
  TransferRecord,
} from "../../../src/core/domain";
import {
  resolveTreasuryReviewChecks,
  treasuryReviewFocus,
} from "../../../src/lib/treasury-review";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const recipient = "0x3333333333333333333333333333333333333333" as Address;
const token = "0x4444444444444444444444444444444444444444" as Address;

function transaction(
  overrides: Partial<SafeTransaction> = {},
): SafeTransaction {
  return {
    safe: { chainId: 50, address: safe },
    safeTxHash:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex,
    nonce: 1n,
    to: target,
    value: 0n,
    data: "0x12345678" as Hex,
    operation: "call",
    status: "pending",
    confirmations: [],
    proposedAt: 1_780_000_000,
    executedAt: null,
    executedTxHash: null,
    blockNumber: null,
    blockHash: null,
    ...overrides,
  };
}

const contractActivity: TransactionActivity = {
  type: "swap",
  label: "DEX router interaction",
  basis: "reviewed-target",
};

function input(
  overrides: Partial<Parameters<typeof resolveTreasuryReviewChecks>[0]> = {},
): Parameters<typeof resolveTreasuryReviewChecks>[0] {
  return {
    activity: contractActivity,
    addressBook: [],
    execution: { success: true, tokenMovements: [] },
    findings: [],
    historyLoaded: true,
    previousTransactions: [],
    previousTransfers: [],
    protocolLabel: "XSwap",
    targetAccountType: "contract",
    targetKnown: true,
    targetVerified: true,
    transferHistoryLoaded: true,
    transaction: transaction(),
    ...overrides,
  };
}

function check(
  checks: ReturnType<typeof resolveTreasuryReviewChecks>,
  key: (typeof checks)[number]["key"],
) {
  return checks.find((item) => item.key === key)!;
}

describe("treasury review checks", () => {
  it("marks an exact successful destination as previously used", () => {
    const previous = transaction({
      safeTxHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex,
      status: "executed",
      executedAt: 1_770_000_000,
    });
    const checks = resolveTreasuryReviewChecks(
      input({ previousTransactions: [previous] }),
    );

    expect(check(checks, "history")).toMatchObject({
      status: "pass",
      title: "Used successfully 1 time",
    });
  });

  it("marks a first interaction as new without calling it malicious", () => {
    const history = check(resolveTreasuryReviewChecks(input()), "history");

    expect(history.status).toBe("new");
    expect(history.title).toBe("Not previously used by this Safe");
    expect(history.detail).toContain("New does not mean malicious");
  });

  it("does not claim a first interaction when history failed to load", () => {
    const history = check(
      resolveTreasuryReviewChecks(input({ historyLoaded: false })),
      "history",
    );

    expect(history).toMatchObject({
      status: "unknown",
      title: "Interaction history unavailable",
    });
  });

  it("blocks a new destination that resembles a previously used address", () => {
    const previous = transaction({
      safeTxHash:
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex,
      to: "0x2222111111111111111111111111111111112222" as Address,
      status: "executed",
      executedAt: 1_770_000_000,
    });
    const current = transaction({
      to: "0x2222999999999999999999999999999999992222" as Address,
    });
    const checks = resolveTreasuryReviewChecks(
      input({ transaction: current, previousTransactions: [previous] }),
    );

    expect(check(checks, "history")).toMatchObject({
      status: "block",
      title: "Possible lookalike address",
    });
  });

  it("checks the exact recipient history for a token transfer", () => {
    const transferActivity: TransactionActivity = {
      type: "transfer",
      label: "Token transfer",
      basis: "selector",
    };
    const current = transaction({ to: token, data: "0xa9059cbb" as Hex });
    const movement = {
      token,
      from: safe,
      to: recipient,
      amount: "100",
      direction: "outbound" as const,
      logIndex: 1,
    };
    const first = resolveTreasuryReviewChecks(
      input({
        activity: transferActivity,
        transaction: current,
        execution: { success: true, tokenMovements: [movement] },
      }),
    );
    expect(check(first, "recipient").status).toBe("new");

    const oldTransfer: TransferRecord = {
      safe: current.safe,
      transactionHash:
        "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Hex,
      token,
      from: safe,
      to: recipient,
      amount: 50n,
      blockNumber: 1n,
      timestamp: 1_770_000_000,
    };
    const repeated = resolveTreasuryReviewChecks(
      input({
        activity: transferActivity,
        transaction: current,
        execution: { success: true, tokenMovements: [movement] },
        previousTransfers: [oldTransfer],
      }),
    );
    expect(check(repeated, "recipient").status).toBe("pass");
  });

  it("blocks flagged destinations and unlimited permissions", () => {
    const checks = resolveTreasuryReviewChecks(
      input({
        addressBook: [
          { address: target, label: "Do not use", trust: "flagged" },
        ],
        findings: [
          {
            code: "unlimited-spending-access",
            severity: "critical",
            title: "Unlimited access",
            detail: "Unlimited access requested.",
            addresses: [target],
          },
        ],
      }),
    );

    expect(check(checks, "identity").status).toBe("block");
    expect(check(checks, "permissions").status).toBe("block");
  });

  it("does not show a green project check when the internal route is unresolved", () => {
    const checks = resolveTreasuryReviewChecks(
      input({
        findings: [
          {
            code: "protocol-path-unconfirmed",
            severity: "warning",
            title: "Route needs review",
            detail: "One internal address was not matched.",
            addresses: [target],
          },
        ],
      }),
    );

    expect(check(checks, "identity")).toMatchObject({
      status: "review",
      title: "XSwap recognized; route needs review",
    });
  });

  it("separates a genuine Silo route from approval of its permissionless market", () => {
    const checks = resolveTreasuryReviewChecks(
      input({
        protocolLabel: "Silo",
        findings: [
          {
            code: "silo-permissionless-market",
            severity: "warning",
            title: "Permissionless market",
            detail: "The market is factory-created but not team-approved.",
            addresses: [target],
          },
        ],
      }),
    );

    expect(check(checks, "identity")).toMatchObject({
      status: "review",
      title: "Silo route verified; market needs approval",
    });
  });

  it("blocks Safe authority changes in the signer checklist", () => {
    const checks = resolveTreasuryReviewChecks(
      input({
        findings: [
          {
            code: "safe-control-change",
            severity: "critical",
            title: "Safe control changes",
            detail: "The owner list changes.",
            addresses: [recipient],
          },
        ],
      }),
    );

    expect(check(checks, "permissions")).toMatchObject({
      label: "Authority and permissions",
      status: "block",
      title: "This changes who can control the Safe",
    });
  });

  it("provides action-specific signer prompts", () => {
    expect(treasuryReviewFocus("swap")).toContain("minimum return");
    expect(treasuryReviewFocus("liquidity")).toContain("pool");
    expect(treasuryReviewFocus("batch")).toContain("every operation");
  });
});
