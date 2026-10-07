import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TransactionSummaryDialog } from "../../../src/components/safes/transaction-summary-dialog";

describe("TransactionSummaryDialog", () => {
  it("renders a saved AI summary immediately", () => {
    const html = renderToStaticMarkup(
      <TransactionSummaryDialog
        endpoint="/api/summary"
        initialSummary={{
          id: "summary-1",
          model: "openai/gpt-5.4-mini",
          summary: {
            headline: "Liquidity deposit identified",
            plainLanguage: "This adds two assets to a liquidity pool.",
            stance: "manual-review",
            keyActions: ["Burns liquidity-pool tokens."],
            risks: ["The minimum output should be checked."],
            checksBeforeSigning: ["Confirm the selected asset."],
            limitations: [],
          },
          usage: null,
          completedAt: 1_700_000_000,
          cached: true,
        }}
      />,
    );

    expect(html).toContain("Liquidity deposit identified");
    expect(html).toContain("Reused saved summary");
    expect(html).not.toContain("No saved AI summary yet");
  });

  it("explains when a transaction has no saved AI summary", () => {
    const html = renderToStaticMarkup(
      <TransactionSummaryDialog
        endpoint="/api/summary"
        initialSummary={null}
      />,
    );

    expect(html).toContain("No saved AI summary yet");
    expect(html).toContain("Generate summary");
  });
});
