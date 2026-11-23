import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisclaimerDialog } from "../../../src/components/home/disclaimer-dialog";

describe("DisclaimerDialog", () => {
  it("renders the complete pre-signature analysis disclaimer", () => {
    const html = renderToStaticMarkup(<DisclaimerDialog />);

    expect(html).toContain("Important disclaimer");
    expect(html).toContain("pre-signature transaction analysis tool");
    expect(html).toContain(
      "reflects the data and evidence available at the time of review",
    );
    expect(html).toContain("designed to support your verification");
    expect(html).toContain("Because on-chain conditions can change");
    expect(html).not.toContain("not guaranteed to be 100% accurate");
    expect(html).toContain("financial, legal, or security advice");
    expect(html).toContain(
      "does not hold, request, or access your private keys",
    );
    expect(html).toContain(
      "transaction execution take place through Safe Global",
    );
    expect(html).toContain("I understand");
  });
});
