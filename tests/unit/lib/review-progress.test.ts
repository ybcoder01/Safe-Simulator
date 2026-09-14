import { describe, expect, it } from "vitest";

import {
  loadReviewedTransactionHashes,
  resolveReviewQueueProgress,
  reviewProgressKey,
  updateTransactionReviewProgress,
} from "../../../src/lib/review-progress";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("browser-local transaction review progress", () => {
  const hashA = `0x${"a".repeat(64)}`;
  const hashB = `0x${"b".repeat(64)}`;
  const key = reviewProgressKey(
    50,
    "0x7aE1ef2979b0dE85d7Dea7F6A5582417D4a98c55",
  );

  it("scopes progress by version, chain, and normalized Safe address", () => {
    expect(key).toBe(
      "safe-inspector:review-progress:v1:50:0x7ae1ef2979b0de85d7dea7f6a5582417d4a98c55",
    );
  });

  it("stores only normalized reviewed transaction hashes", () => {
    const storage = memoryStorage();

    updateTransactionReviewProgress(storage, key, hashB.toUpperCase(), true);
    const reviewed = updateTransactionReviewProgress(
      storage,
      key,
      hashA,
      true,
    ).reviewed;

    expect([...reviewed]).toEqual([hashB, hashA]);
    expect([...loadReviewedTransactionHashes(storage, key)]).toEqual([
      hashA,
      hashB,
    ]);
  });

  it("reopens a completed review and ignores malformed stored data", () => {
    const storage = memoryStorage();
    updateTransactionReviewProgress(storage, key, hashA, true);

    expect(
      updateTransactionReviewProgress(storage, key, hashA, false).reviewed.size,
    ).toBe(0);

    expect(
      loadReviewedTransactionHashes(
        memoryStorage({ [key]: '{"version":2,"reviewed":["bad"]}' }),
        key,
      ).size,
    ).toBe(0);
  });

  it("keeps in-page progress when browser storage cannot write", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("disabled");
      },
    };

    const result = updateTransactionReviewProgress(storage, key, hashA, true);
    expect(result.reviewed.has(hashA)).toBe(true);
    expect(result.stored).toBe(false);
  });

  it("skips completed items and wraps to the first remaining review", () => {
    const hashC = "0x" + "c".repeat(64);
    const queue = [hashA, hashB, hashC].map((safeTxHash) => ({
      href: "/tx/" + safeTxHash,
      safeTxHash,
    }));

    const middle = resolveReviewQueueProgress(queue, hashB, new Set([hashA]));
    expect(middle.completed).toBe(1);
    expect(middle.position).toBe(0);
    expect(middle.previous).toBeNull();
    expect(middle.next?.safeTxHash).toBe(hashC);
    expect(middle.nextAfterCompletion?.safeTxHash).toBe(hashC);

    const last = resolveReviewQueueProgress(queue, hashC, new Set([hashB]));
    expect(last.next).toBeNull();
    expect(last.nextAfterCompletion?.safeTxHash).toBe(hashA);
  });
});
