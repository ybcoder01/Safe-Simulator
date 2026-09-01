import { describe, expect, it } from "vitest";

import { reanalysisCoveragePercent } from "../../../../src/lib/api/reanalysis-request";

describe("reanalysis coverage", () => {
  it("reports zero before transaction history is available", () => {
    expect(
      reanalysisCoveragePercent({
        analyzedTransactions: 0,
        totalTransactions: 0,
      }),
    ).toBe(0);
  });

  it("rounds current-version coverage to a whole percentage", () => {
    expect(
      reanalysisCoveragePercent({
        analyzedTransactions: 2,
        totalTransactions: 3,
      }),
    ).toBe(67);
  });

  it("clamps stale or inconsistent counts to the progress range", () => {
    expect(
      reanalysisCoveragePercent({
        analyzedTransactions: 12,
        totalTransactions: 10,
      }),
    ).toBe(100);
    expect(
      reanalysisCoveragePercent({
        analyzedTransactions: -1,
        totalTransactions: 10,
      }),
    ).toBe(0);
  });
});
