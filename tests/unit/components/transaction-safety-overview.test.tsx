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
  addressCheckTitle: "No obvious address replacement found",
  addressCheckDetail: "The important addresses matched available evidence.",
  addressChecks: [],
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
        routeAttestation={{
          protocol: "silo",
          status: "review",
          title: "Silo route is only partly verified",
          detail: "One connected contract remains unresolved.",
          addresses: [],
          proxyBoundaries: [],
          findings: [],
          checks: [
            {
              key: "destination",
              status: "pass",
              title: "Official Silo router",
              detail: "The destination matches the reviewed deployment.",
            },
            {
              key: "route",
              status: "review",
              title: "1 connected contract still unconfirmed",
              detail: "Review it before signing.",
            },
          ],
        }}
        targetAddress="0x1111111111111111111111111111111111111111"
        targetLabel="Example contract"
        targetTokenSymbol={null}
        treasuryChecks={[
          {
            key: "history",
            label: "Previous interaction",
            status: "new",
            title: "Not previously used by this Safe",
            detail: "Verify this exact destination.",
          },
        ]}
        treasuryFocus="Confirm the complete destination and amount."
      />,
    );

    expect(html).toContain('aria-labelledby="plain-language-verdict-title"');
    expect(html).toContain("No known risks found");
    expect(html).toContain("Verified smart contract");
    expect(html).toContain('aria-hidden="true">✓');
    expect(html).toContain('safety-state-label">No warnings');
    expect(html).toContain("Which project is involved?");
    expect(html).toContain("Was an address or permission changed?");
    expect(html).toContain("Before the final approval");
    expect(html).toContain("Treasury approval checklist");
    expect(html).toContain("Not previously used by this Safe");
    expect(html).toContain("treasury-check-new");
    expect(html).toContain("How we verified this project");
    expect(html).toContain("Official Silo router");
    expect(html).toContain("1 connected contract still unconfirmed");
    expect(html).toContain("protocol-verification-review");
    expect(html).toContain('aria-hidden="true">×');
    expect(html).not.toContain('safety-state-label">clear');
  });
});
