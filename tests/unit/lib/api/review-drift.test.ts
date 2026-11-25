import { describe, expect, it } from "vitest";

import type { AnalysisReviewContext, Hex } from "@/core/domain";
import { compareAnalysisReviewContexts } from "@/lib/api/review-drift";

const context = (
  overrides: Partial<AnalysisReviewContext> = {},
): AnalysisReviewContext => ({
  capturedAt: 100,
  targetCodeHash: `0x${"1".repeat(64)}` as Hex,
  implementationChain: [],
  confirmationOwners: [],
  simulationFingerprint: `0x${"2".repeat(64)}` as Hex,
  safe: {
    owners: [],
    threshold: 1,
    nonce: "7",
    guard: null,
    modules: [],
    implementation: null,
  },
  ...overrides,
});

describe("compareAnalysisReviewContexts", () => {
  it("reports an unchanged execution environment", () => {
    expect(compareAnalysisReviewContexts(context(), context())).toMatchObject({
      status: "unchanged",
      changes: [],
    });
  });

  it("treats code and Safe configuration drift as critical", () => {
    const result = compareAnalysisReviewContexts(
      context(),
      context({
        targetCodeHash: `0x${"3".repeat(64)}` as Hex,
        safe: { ...context().safe!, threshold: 2 },
      }),
    );

    expect(result.status).toBe("changed");
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "target-code", severity: "critical" }),
        expect.objectContaining({
          key: "safe-configuration",
          severity: "critical",
        }),
      ]),
    );
  });

  it("separates normal signature progress from transaction-field drift", () => {
    const result = compareAnalysisReviewContexts(
      context(),
      context({
        confirmationOwners: ["0x1111111111111111111111111111111111111111"],
      }),
    );

    expect(result.changes).toEqual([
      expect.objectContaining({ key: "signatures", severity: "info" }),
    ]);
  });
});
