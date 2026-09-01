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
});
