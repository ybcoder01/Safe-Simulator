import { describe, expect, it } from "vitest";

import {
  summarizePendingTrustReviews,
  withoutSafe,
} from "../../../../src/lib/api/safes";

describe("Safe watchlist views", () => {
  it("removes only the matching chain and address, case-insensitively", () => {
    const items = [
      {
        chainId: 1,
        address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        label: "Ethereum",
      },
      {
        chainId: 50,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        label: "XDC",
      },
      {
        chainId: 1,
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        label: "Other",
      },
    ];

    expect(
      withoutSafe(items, {
        chainId: 1,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toEqual([items[1], items[2]]);
  });

  it("is idempotent when the target is not present", () => {
    const items = [{ chainId: 1, address: "0x1111" }];

    expect(withoutSafe(items, { chainId: 50, address: "0x1111" })).toEqual(
      items,
    );
  });

  it("keeps an unresolved review visible after the current owner votes", () => {
    const summary = summarizePendingTrustReviews([
      {
        address: "0x1111111111111111111111111111111111111111",
        label: "Protocol contract",
        status: "pending",
        trustedApprovals: 1,
        flaggedApprovals: 0,
        requiredApprovals: 2,
        currentUserDecision: "trusted",
        updatedAt: 1,
      },
    ]);

    expect(summary).toEqual({ pending: 1, actionable: 0 });
  });

  it("separates reviews needing this owner's decision from all pending reviews", () => {
    const summary = summarizePendingTrustReviews([
      {
        address: "0x1111111111111111111111111111111111111111",
        label: "First contract",
        status: "pending",
        trustedApprovals: 1,
        flaggedApprovals: 0,
        requiredApprovals: 2,
        currentUserDecision: null,
        updatedAt: 1,
      },
      {
        address: "0x2222222222222222222222222222222222222222",
        label: "Second contract",
        status: "pending",
        trustedApprovals: 1,
        flaggedApprovals: 0,
        requiredApprovals: 2,
        currentUserDecision: "trusted",
        updatedAt: 2,
      },
      {
        address: "0x3333333333333333333333333333333333333333",
        label: "Resolved contract",
        status: "trusted",
        trustedApprovals: 2,
        flaggedApprovals: 0,
        requiredApprovals: 2,
        currentUserDecision: "trusted",
        updatedAt: 3,
      },
    ]);

    expect(summary).toEqual({ pending: 2, actionable: 1 });
  });
});
