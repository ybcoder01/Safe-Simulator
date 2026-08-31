import { describe, expect, it, vi } from "vitest";

import { CANONICAL_PERMIT2_ADDRESS } from "../../../../src/core/analysis/tokens/approval-intents";
import type {
  Address,
  Hex,
  SafeTransaction,
} from "../../../../src/core/domain";
import type { ContractInsight } from "../../../../src/lib/api/contract-insight";
import type { ExecutionInsight } from "../../../../src/lib/api/execution-insight";
import { resolveApprovalRisk } from "../../../../src/lib/api/approval-risk";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;
const hash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

function word(value: bigint | Address): string {
  const body =
    typeof value === "bigint"
      ? value.toString(16)
      : value.toLowerCase().slice(2);
  return body.padStart(64, "0");
}

function approvalData(amount: bigint): Hex {
  return ("0x095ea7b3" + word(spender) + word(amount)) as Hex;
}

function adjustmentData(
  selector: "0x39509351" | "0xa457c2d7",
  amount: bigint,
): Hex {
  return (selector + word(spender) + word(amount)) as Hex;
}

function transaction(
  status: SafeTransaction["status"],
  to: Address = token,
  data: Hex = approvalData(1000n),
): SafeTransaction {
  const executed = status === "executed";
  return {
    safe: { chainId: 50, address: safe },
    safeTxHash: hash,
    nonce: 1n,
    to,
    value: 0n,
    data,
    operation: "call",
    status,
    confirmations: [],
    proposedAt: 1,
    executedAt: executed ? 2 : null,
    executedTxHash: executed ? hash : null,
    blockNumber: executed ? 10n : null,
    blockHash: executed ? hash : null,
  };
}

function execution(
  allowances: ExecutionInsight["allowanceChanges"] = [],
): ExecutionInsight {
  return {
    mode:
      allowances.length > 0 ? "executed-replay" : "safe-execution-check",
    success: true,
    gasUsed: "1",
    blockNumber: allowances.length > 0 ? "10" : "20",
    blockHash: hash,
    rootCall: null,
    internalCalls: [],
    logs: [],
    storageChanges: [],
    tokenMovements: [],
    allowanceChanges: allowances,
    safeConfigurationChanges: [],
    error: null,
    coverage: {
      outcome: allowances.length > 0 ? "on-chain-receipt" : "read-only-call",
      callTrace: "root-only",
      eventLogs: allowances.length > 0 ? "complete" : "unavailable",
      tokenEvents: allowances.length > 0 ? "standard-events" : "unavailable",
      storageDiff: "unavailable",
    },
    warnings: [],
  };
}

const contract: Pick<ContractInsight, "decoded"> = { decoded: null };

describe("resolveApprovalRisk", () => {
  it("compares a pending approval with latest state", async () => {
    const chain = {
      call: vi.fn().mockResolvedValue(("0x" + word(0n)) as Hex),
    };

    const result = await resolveApprovalRisk(
      chain,
      transaction("pending"),
      contract,
      execution(),
    );

    expect(result.anchor).toEqual({
      type: "latest-state",
      blockNumber: null,
    });
    expect(result.requests[0]).toMatchObject({
      priorAmount: "0",
      newSpenderAtAnchor: true,
    });
    expect(chain.call).toHaveBeenCalledWith(
      50,
      expect.objectContaining({
        to: token,
        data: expect.stringMatching(/^0xdd62ed3e/),
      }),
      undefined,
    );
  });

  it("anchors executed allowance comparison to the previous block", async () => {
    const chain = {
      call: vi.fn().mockResolvedValue(("0x" + word(25n)) as Hex),
    };
    const emitted = {
      token,
      owner: safe,
      spender,
      amount: "1000",
      infinite: false,
      logIndex: 2,
    };

    const result = await resolveApprovalRisk(
      chain,
      transaction("executed"),
      contract,
      execution([emitted]),
    );

    expect(result.anchor).toEqual({
      type: "previous-block",
      blockNumber: "9",
    });
    expect(result.executedChanges[0]).toMatchObject({
      priorAmount: "25",
      newSpenderAtAnchor: false,
    });
    expect(chain.call).toHaveBeenCalledWith(50, expect.any(Object), 9n);
    expect(result.warnings[0]).toContain("previous block");
  });

  it("keeps new-spender status unknown when the RPC read fails", async () => {
    const chain = {
      call: vi.fn().mockRejectedValue(new Error("unavailable")),
    };

    const result = await resolveApprovalRisk(
      chain,
      transaction("pending"),
      contract,
      execution(),
    );

    expect(result.requests[0]).toMatchObject({
      priorAmount: null,
      newSpenderAtAnchor: null,
    });
    expect(result.requests[0]?.warning).toContain("could not be read");
  });

  it("projects an allowance increase from anchored prior state", async () => {
    const chain = {
      call: vi.fn().mockResolvedValue(("0x" + word(100n)) as Hex),
    };

    const result = await resolveApprovalRisk(
      chain,
      transaction("pending", token, adjustmentData("0x39509351", 25n)),
      contract,
      execution(),
    );

    expect(result.requests[0]).toMatchObject({
      method: "increaseAllowance",
      amount: "25",
      amountMode: "increase",
      priorAmount: "100",
      resultingAmount: "125",
      infinite: false,
      newSpenderAtAnchor: false,
    });
  });

  it("detects an increase that reaches exact uint256 maximum", async () => {
    const maximum = (1n << 256n) - 1n;
    const chain = {
      call: vi.fn().mockResolvedValue(("0x" + word(maximum - 10n)) as Hex),
    };

    const result = await resolveApprovalRisk(
      chain,
      transaction("pending", token, adjustmentData("0x39509351", 10n)),
      contract,
      execution(),
    );

    expect(result.requests[0]).toMatchObject({
      resultingAmount: maximum.toString(),
      infinite: true,
    });
  });

  it("projects decreases and keeps underflow-shaped requests explicit", async () => {
    const chain = {
      call: vi.fn().mockResolvedValue(("0x" + word(100n)) as Hex),
    };

    const bounded = await resolveApprovalRisk(
      chain,
      transaction("pending", token, adjustmentData("0xa457c2d7", 25n)),
      contract,
      execution(),
    );
    const excessive = await resolveApprovalRisk(
      chain,
      transaction("pending", token, adjustmentData("0xa457c2d7", 125n)),
      contract,
      execution(),
    );

    expect(bounded.requests[0]).toMatchObject({
      amountMode: "decrease",
      resultingAmount: "75",
      infinite: false,
    });
    expect(excessive.requests[0]).toMatchObject({
      resultingAmount: null,
      infinite: null,
    });
    expect(excessive.requests[0]?.warning).toContain("would revert");
  });

  it("does not label a zero-to-zero approval as a new spender", async () => {
    const chain = {
      call: vi.fn().mockResolvedValue(("0x" + word(0n)) as Hex),
    };

    const result = await resolveApprovalRisk(
      chain,
      transaction("pending", token, approvalData(0n)),
      contract,
      execution(),
    );

    expect(result.requests[0]).toMatchObject({
      resultingAmount: "0",
      newSpenderAtAnchor: false,
    });
  });

  it("queries Permit2 allowance state through the canonical contract", async () => {
    const data = ("0x87517c45" +
      word(token) +
      word(spender) +
      word(500n) +
      word(1000n)) as Hex;
    const chain = {
      call: vi
        .fn()
        .mockResolvedValue(("0x" + word(0n) + word(0n) + word(0n)) as Hex),
    };

    const result = await resolveApprovalRisk(
      chain,
      transaction("pending", CANONICAL_PERMIT2_ADDRESS, data),
      contract,
      execution(),
    );

    expect(result.requests[0]).toMatchObject({
      standard: "permit2-allowance",
      priorAmount: "0",
      newSpenderAtAnchor: true,
    });
    expect(chain.call).toHaveBeenCalledWith(
      50,
      expect.objectContaining({
        to: CANONICAL_PERMIT2_ADDRESS,
        data: expect.stringMatching(/^0x927da105/),
      }),
      undefined,
    );
  });
});
