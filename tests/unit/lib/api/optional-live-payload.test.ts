import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  Confirmation,
  Hex,
  SafeExecutionPayload,
  SafeRef,
} from "@/core/domain";
import {
  mergeConfirmationSnapshots,
  resolveOptionalLivePayload,
} from "@/lib/api/optional-live-payload";

const safe = {
  chainId: 50,
  address: "0x1111111111111111111111111111111111111111",
} as SafeRef;
const safeTxHash = `0x${"a".repeat(64)}` as Hex;

describe("resolveOptionalLivePayload", () => {
  it("returns live fields when the Safe service responds within the budget", async () => {
    const payload = { safe, safeTxHash } as SafeExecutionPayload;
    const getMultisigTransaction = vi.fn().mockResolvedValue(payload);

    await expect(
      resolveOptionalLivePayload(
        { getMultisigTransaction },
        safe,
        safeTxHash,
        50,
      ),
    ).resolves.toBe(payload);
  });

  it("stops optional fields from blocking the details page", async () => {
    vi.useFakeTimers();
    const getMultisigTransaction = vi.fn(
      () => new Promise<SafeExecutionPayload | null>(() => undefined),
    );
    const result = resolveOptionalLivePayload(
      { getMultisigTransaction },
      safe,
      safeTxHash,
      50,
    );

    await vi.advanceTimersByTimeAsync(50);
    await expect(result).resolves.toBeNull();
    vi.useRealTimers();
  });

  it("treats Safe service failures as unavailable optional evidence", async () => {
    const getMultisigTransaction = vi
      .fn()
      .mockRejectedValue(new Error("Safe service unavailable"));

    await expect(
      resolveOptionalLivePayload(
        { getMultisigTransaction },
        safe,
        safeTxHash,
        50,
      ),
    ).resolves.toBeNull();
  });
});

describe("mergeConfirmationSnapshots", () => {
  const confirmation = (owner: string, signature: string): Confirmation => ({
    owner: owner as Address,
    signature: signature as Hex,
    signedAt: 1_700_000_000,
  });

  it("adds a newly observed live signer to the stored snapshot", () => {
    const first = confirmation(`0x${"1".repeat(40)}`, `0x${"a".repeat(130)}`);
    const second = confirmation(`0x${"2".repeat(40)}`, `0x${"b".repeat(130)}`);

    expect(mergeConfirmationSnapshots([first], [first, second])).toEqual([
      first,
      second,
    ]);
  });

  it("does not regress when a live service snapshot is temporarily stale", () => {
    const first = confirmation(`0x${"1".repeat(40)}`, `0x${"a".repeat(130)}`);
    const second = confirmation(`0x${"2".repeat(40)}`, `0x${"b".repeat(130)}`);

    expect(mergeConfirmationSnapshots([first, second], [first])).toEqual([
      first,
      second,
    ]);
  });

  it("deduplicates the same owner and prefers its live confirmation", () => {
    const stored = confirmation(
      `0x${"1".repeat(40)}`,
      `0x${"a".repeat(130)}`,
    );
    const live = confirmation(
      `0x${"1".repeat(40)}`,
      `0x${"b".repeat(130)}`,
    );

    expect(mergeConfirmationSnapshots([stored], [live])).toEqual([live]);
  });
});
