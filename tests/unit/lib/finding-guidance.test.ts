import { describe, expect, it } from "vitest";

import type { Finding } from "../../../src/core/domain";
import {
  findingGuidance,
  findingReviewSummary,
} from "../../../src/lib/finding-guidance";

function finding(code: string, severity: Finding["severity"]): Finding {
  return { code, severity, title: code, detail: code, addresses: [] };
}

describe("finding guidance", () => {
  it("gives infinite allowances a bounded-approval action", () => {
    expect(
      findingGuidance(finding("requested-infinite-allowance", "critical")),
    ).toMatchObject({
      label: "Prefer a bounded allowance",
    });
  });

  it("uses severity-specific guidance for future finding codes", () => {
    expect(findingGuidance(finding("future-warning", "warning"))).toMatchObject(
      {
        label: "Verify before signing",
      },
    );
  });

  it("prioritizes critical findings in the review summary", () => {
    expect(
      findingReviewSummary([
        finding("warning", "warning"),
        finding("critical", "critical"),
      ]),
    ).toMatchObject({ tone: "critical" });
  });

  it("summarizes warnings when no critical finding exists", () => {
    expect(
      findingReviewSummary([
        finding("warning-one", "warning"),
        finding("warning-two", "warning"),
      ]),
    ).toMatchObject({
      tone: "warning",
      detail: expect.stringContaining("2 warnings"),
    });
  });

  it("keeps a positive summary honest about evidence limits", () => {
    expect(findingReviewSummary([finding("coverage", "info")])).toMatchObject({
      tone: "clear",
      detail: expect.stringContaining("coverage boundary"),
    });
  });
});
