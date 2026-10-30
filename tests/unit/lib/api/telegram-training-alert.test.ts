import { describe, expect, it } from "vitest";

import { formatMaliciousTrainingAlert } from "../../../../src/lib/api/telegram-training-alert";

describe("formatMaliciousTrainingAlert", () => {
  it("clearly labels the alert as synthetic while preserving realistic warnings", () => {
    const alert = formatMaliciousTrainingAlert({
      chainId: 50,
      address: "0x000000000000000000000000000000000000d000",
    });

    expect(alert).toContain("SAFE INSPECTOR TRAINING ALERT");
    expect(alert).toContain("NO ON-CHAIN TRANSACTION EXISTS");
    expect(alert).toContain("STOP. DON'T SIGN YET");
    expect(alert).toContain("High-privilege delegate call");
    expect(alert).toContain("Unrecognized address");
    expect(alert).toContain("Waiting for the last signature (1 of 2 signed)");
    expect(alert).toContain(
      "Nothing was created, proposed, signed, or executed.",
    );
  });
});
