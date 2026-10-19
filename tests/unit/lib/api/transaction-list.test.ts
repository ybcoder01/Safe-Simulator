import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  AnalysisResult,
  Hex,
  SafeRef,
  SafeTransaction,
} from "../../../../src/core/domain";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "../../../../src/lib/api/analysis-version";
import { resolveTransactionViews } from "../../../../src/lib/api/transaction-list";

const safe: SafeRef = {
  chainId: 50,
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
};
const target = "0x2222222222222222222222222222222222222222" as Address;

function hash(digit: string) {
  return `0x${digit.repeat(64)}` as Hex;
}

function transaction(index: number): SafeTransaction {
  return {
    safe,
    safeTxHash: hash(String(index)),
    nonce: BigInt(index),
    to: target,
    value: 0n,
    data: "0x",
    operation: "call",
    status: "executed",
    confirmations: [],
    proposedAt: index,
    executedAt: index,
    executedTxHash: hash(String(index)),
    blockNumber: BigInt(index),
    blockHash: hash("a"),
  };
}

function analysis(
  safeTxHash: Hex,
  verdict: AnalysisResult["verdict"],
): AnalysisResult {
  return {
    safeTxHash,
    engineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
    verdict,
    findings: [],
    simulation: null,
    createdAt: 99,
    immutable: true,
  };
}

describe("transaction list analysis metadata", () => {
  it("batch-loads one Safe and preserves transaction ordering", async () => {
    const first = transaction(1);
    const second = transaction(2);
    const findAnalyses = vi
      .fn()
      .mockResolvedValue([analysis(second.safeTxHash, "flagged")]);

    const result = await resolveTransactionViews({ findAnalyses }, safe, [
      first,
      second,
    ]);

    expect(findAnalyses).toHaveBeenCalledWith(
      safe,
      [first.safeTxHash, second.safeTxHash],
      TRANSACTION_ANALYSIS_ENGINE_VERSION,
    );
    expect(result.map((item) => item.safeTxHash)).toEqual([
      first.safeTxHash,
      second.safeTxHash,
    ]);
    expect(result[0]?.analysis).toBeNull();
    expect(result[1]?.analysis).toEqual({
      baselineVerdict: "flagged",
      analyzedAt: 99,
      immutable: true,
    });
  });

  it("does not query persistence for an empty transaction page", async () => {
    const findAnalyses = vi.fn();

    await expect(
      resolveTransactionViews({ findAnalyses }, safe, []),
    ).resolves.toEqual([]);
    expect(findAnalyses).not.toHaveBeenCalled();
  });

  it("uses reviewed token metadata for approval amounts", async () => {
    const amount = 19_999_990n * 10n ** 18n;
    const approval = {
      ...transaction(3),
      to: "0x951857744785E80e2De051c32EE7b25f9c458C42" as Address,
      data: `0x095ea7b3${"0".repeat(24)}${"3".repeat(40)}${amount.toString(16).padStart(64, "0")}` as Hex,
    };

    const result = await resolveTransactionViews(
      { findAnalyses: vi.fn().mockResolvedValue([]) },
      safe,
      [approval],
    );

    expect(result[0]?.summary).toBe(
      "Approve 0x333333…333333 for 19,999,990 WXDC",
    );
  });

  it("reads standard metadata for unreviewed token contracts", async () => {
    const approval = {
      ...transaction(4),
      data: `0x095ea7b3${"0".repeat(24)}${"3".repeat(40)}${1_500_000n.toString(16).padStart(64, "0")}` as Hex,
    };
    const call = vi
      .fn()
      .mockResolvedValueOnce(`0x${6n.toString(16).padStart(64, "0")}`)
      .mockResolvedValueOnce(
        `0x${32n.toString(16).padStart(64, "0")}${4n.toString(16).padStart(64, "0")}${Buffer.from("TEST").toString("hex").padEnd(64, "0")}`,
      );

    const result = await resolveTransactionViews(
      { findAnalyses: vi.fn().mockResolvedValue([]) },
      safe,
      [approval],
      {
        chain: { call },
        cache: {
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    );

    expect(result[0]?.summary).toBe("Approve 0x333333…333333 for 1.5 TEST");
  });

  it("does not expose raw base units when token metadata is unavailable", async () => {
    const approval = {
      ...transaction(5),
      data: `0x095ea7b3${"0".repeat(24)}${"3".repeat(40)}${1_500_000n.toString(16).padStart(64, "0")}` as Hex,
    };

    const result = await resolveTransactionViews(
      { findAnalyses: vi.fn().mockResolvedValue([]) },
      safe,
      [approval],
      {
        chain: {
          call: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
        },
        cache: {
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    );

    expect(result[0]?.summary).toContain("amount that could not be displayed");
    expect(result[0]?.summary).not.toContain("base units");
  });
});
