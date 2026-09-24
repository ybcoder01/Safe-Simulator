import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TransactionSafetyOverview } from "../../../src/components/safes/transaction-safety-overview";
import type { TransactionReviewPresentation } from "../../../src/lib/transaction-review-presentation";

const presentation: TransactionReviewPresentation = {
  signal: "clear",
  icon: "✓",
  title: "No known risks found",
  detail: "The checks we could perform did not find a known risk.",
  nextStep: "Confirm the destination before proceeding.",
  targetType: "Verified smart contract",
  targetExplanation: "This address runs verified smart-contract code.",
  actionSummary: "Approve 1 USDC",
};

describe("TransactionSafetyOverview", () => {
  it("renders a text verdict and target classification without relying on color", () => {
    const html = renderToStaticMarkup(
      <TransactionSafetyOverview
        addressBook={[]}
        chainId={50}
        presentation={presentation}
        protocolLabel={null}
        protocolLogoKey={null}
        targetAddress="0x1111111111111111111111111111111111111111"
        targetLabel="Example contract"
        targetTokenSymbol={null}
      />,
    );

    expect(html).toContain('aria-labelledby="plain-language-verdict-title"');
    expect(html).toContain("No known risks found");
    expect(html).toContain("Verified smart contract");
    expect(html).toContain('aria-hidden="true">✓');
    expect(html).toContain('safety-state-label">No warnings');
    expect(html).toContain("What you should do");
    expect(html).not.toContain('safety-state-label">clear');
  });
});
