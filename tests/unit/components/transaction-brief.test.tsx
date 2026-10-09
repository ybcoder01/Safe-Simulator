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
    label: "Check before you sign",
    reason: "1 thing to confirm before you sign.",
  },
  sentence: "Your Safe receives 1,200 USDC.",
  rows: [
    {
      key: "identity",
      status: "ok",
      label: "Who you're dealing with",
      text: "Silo",
    },
    {
      key: "recipient",
      status: "check",
      label: "Who gets the money",
      text: "Recipient needs confirmation",
    },
  ],
  todo: ["Confirm that your team chose this specific market."],
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
    {
      key: "n",
      normal: true,
      title: "Normal Safe wallet behavior",
      text: "Nothing to do.",
    },
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
  it("opens with the verdict, the sentence, a few rows, and one to-do list", () => {
    const html = render();

    expect(html).toContain("Check before you sign");
    expect(html).toContain("Your Safe receives 1,200 USDC.");
    expect(html).toContain("Waiting for the last signature (1 of 2 signed)");
    expect(html).toContain("Who you&#x27;re dealing with");
    expect(html).toContain("Who gets the money");
    expect(html).toContain("Before you sign");
    expect(html).toContain(
      "Confirm that your team chose this specific market.",
    );
  });

  it("keeps everything else behind one collapsed disclosure", () => {
    const html = render();
    const more = html.indexOf('<details class="brief-more">');

    expect(more).toBeGreaterThan(html.indexOf("Before you sign"));
    expect(html).not.toContain('<details class="brief-more" open');
    for (const heading of [
      "Where the money goes",
      "Why each check matters",
      "Good to know",
      "What we confirmed, and what we could not",
    ]) {
      expect(html.indexOf(heading)).toBeGreaterThan(more);
    }
    expect(html.indexOf("Silo market vault")).toBeGreaterThan(more);
  });

  it("switches wording for an executed transaction", () => {
    const html = render({ executed: true });

    expect(html).toContain("What to look at");
    expect(html).not.toContain("Before you sign");
  });
});
