import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AlertStageComparisonBanner,
  AlertStageTimeline,
} from "../../../src/components/shared/alert-stage-timeline";
import type { StageTimelineEntry } from "../../../src/lib/alert-stage";

const entries: readonly StageTimelineEntry[] = [
  {
    key: "pending:1",
    stage: {
      id: "collecting-signatures",
      label: "Waiting for the last signature (1 of 2 signed)",
      detail: "Owners can still decide not to sign.",
      open: true,
    },
    at: 1_791_208_087,
    current: false,
    alert: {
      verificationId: "a".repeat(32),
      issuedAt: 1_791_208_101,
      status: "pending",
      signatureCount: 1,
      threshold: 2,
      verdict: "unverified",
      findingCodes: ["internal-delegatecall"],
    },
  },
  {
    key: "executed",
    stage: {
      id: "executed",
      label: "Executed",
      detail: "The transaction has run on-chain and cannot be stopped.",
      open: false,
    },
    at: 1_791_208_142,
    current: true,
    alert: null,
  },
];

describe("AlertStageTimeline", () => {
  it("keeps the pre-sign alert visible and marks the executed state as now", () => {
    const html = renderToStaticMarkup(
      <AlertStageTimeline
        entries={entries}
        findingTitle={(code) => `Title for ${code}`}
      />,
    );

    expect(html).toContain("Waiting for the last signature (1 of 2 signed)");
    expect(html).toContain("Could not verify enough — review manually");
    expect(html).toContain("Title for internal-delegatecall");
    expect(html).toContain("has since");
    expect(html).toContain("alert-now-pill");
    expect(html).toContain("/alerts/verify/" + "a".repeat(32));
    expect(html.indexOf("Waiting for the last")).toBeLessThan(
      html.indexOf("Executed"),
    );
  });
});

describe("AlertStageComparisonBanner", () => {
  it("shows the alerted stage beside the current one", () => {
    const html = renderToStaticMarkup(
      <AlertStageComparisonBanner
        comparison={{
          then: entries[0]!.stage,
          now: entries[1]!.stage,
          changed: true,
          headline: "This transaction has since executed",
          explanation: "Kept exactly as shown.",
        }}
      />,
    );
    expect(html).toContain("When this alert was sent");
    expect(html).toContain("Where the transaction is now");
    expect(html).toContain("alert-stage-changed");
  });
});
