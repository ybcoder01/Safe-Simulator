import { describe, expect, it } from "vitest";

import { aggregateVerdict } from "../../../../../src/core/analysis/trust/verdict";

describe("aggregateVerdict", () => {
  it("defaults to trusted when no addresses were touched", () => {
    expect(aggregateVerdict([])).toBe("trusted");
  });

  it("inherits the worst constituent verdict", () => {
    expect(aggregateVerdict(["trusted", "known", "unverified"])).toBe(
      "unverified",
    );
    expect(aggregateVerdict(["flagged", "trusted", "known"])).toBe("flagged");
  });

  it("is independent of input order", () => {
    const forward = aggregateVerdict(["trusted", "flagged", "unverified"]);
    const reverse = aggregateVerdict(["unverified", "flagged", "trusted"]);

    expect(forward).toBe(reverse);
  });
});
