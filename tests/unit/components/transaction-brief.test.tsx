import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TransactionBriefPanel } from "../../../src/components/safes/transaction-brief";
import type { AlertStage } from "../../../src/lib/alert-stage";
import type { TransactionBrief } from "../../../src/lib/transaction-brief";

const safe = "0x1111111111111111111111111111111111111111";
const market = "0x2222222222222222222222222222222222222222";

const stage: AlertStage = {
  id: "collecting-signatures",
  label: "Waiting for the last signature (1 of 2 signed)",
  detail: "Owners can still decide not to sign.",
  open: true,
};

const brief: TransactionBrief = {
  verdict: {
    id: "check",
    label: "Needs a check",
    reason: "1 thing to confirm before you sign.",
  },
  sentence: "Your Safe receives 1,200 USDC.",
  effects: ["No spending permissions change."],
  checks: [
    {
      key: "silo-permissionless-market",
      severity: "warning",
      title: "Silo route verified; market approval still required",
      why: "Anyone can create a Silo market.",
      action: "Confirm that your team chose this specific market.",
    },
  ],
  notes: [
    { key: "n", title: "Normal Safe wallet behavior", text: "Nothing to do." },
  ],
  confirmations: [
    {
      key: "a",
      confirmed: false,
      label: "Recipient",
      text: "Not in address book",
    },
    { key: "b", confirmed: true, label: "Router", text: "Matches Silo" },
  ],
};

function render(
  overrides: Partial<Parameters<typeof TransactionBriefPanel>[0]> = {},
) {
  return renderToStaticMarkup(
    <TransactionBriefPanel
      addressBook={[]}
      brief={brief}
      chainId={50}
      executed={false}
      flow={[
        {
          key: "f",
          direction: "inbound",
          amount: "1,200",
          symbol: "USDC",
          from: market,
          to: safe,
        },
      ]}
      knownLabels={{ [market]: "Silo market vault" }}
      safeAddress={safe}
      stage={stage}
      totalMovements={1}
      {...overrides}
    />,
  );
}

describe("TransactionBriefPanel", () => {
  it("leads with the verdict, the plain sentence, and the stage", () => {
    const html = render();

    expect(html).toContain("Needs a check");
    expect(html).toContain("Safe to sign?");
    expect(html).toContain("Your Safe receives 1,200 USDC.");
    expect(html).toContain("Waiting for the last signature (1 of 2 signed)");
  });

  it("draws the money flow with the Safe named plainly", () => {
    const html = render();

    expect(html).toContain("Your Safe");
    expect(html).toContain("Silo market vault");
    expect(html).toContain("1,200 USDC");
  });

  it("groups actions, harmless notes, and confirmations separately", () => {
    const html = render();

    expect(html).toContain("Check before signing");
    expect(html).toContain(
      "Confirm that your team chose this specific market.",
    );
    expect(html).toContain("Why this matters");
    expect(html).toContain("Fine, for your information");
    expect(html).toContain("Not confirmed");
    expect(html.indexOf("Not confirmed")).toBeLessThan(
      html.indexOf("Confirmed</em>"),
    );
  });

  it("switches wording for an executed transaction", () => {
    const html = render({ executed: true });

    expect(html).toContain("Worth checking now");
    expect(html).toContain("Result of the safety check");
    expect(html).not.toContain("Safe to sign?");
  });
});
