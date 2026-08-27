import { describe, expect, it } from "vitest";

import { transactionServiceConfig } from "../../../../src/adapters/safe-api/safe-data";

describe("transactionServiceConfig", () => {
  it("uses the SDK-hosted XDC service when an API key is configured", () => {
    expect(
      transactionServiceConfig(50, {
        NODE_ENV: "test",
        SAFE_API_KEY: "test-key",
      }),
    ).toEqual({
      apiKey: "test-key",
      serviceBaseUrl: "https://api.safe.global/tx-service/xdc",
    });
  });

  it("normalizes custom service URLs for SDK and direct API requests", () => {
    expect(
      transactionServiceConfig(999, {
        NODE_ENV: "test",
        SAFE_TX_SERVICE_URL_999: "https://safe.example/api/",
      }),
    ).toEqual({
      serviceBaseUrl: "https://safe.example",
      txServiceUrl: "https://safe.example/api",
    });
  });

  it("requires explicit configuration for unsupported chains", () => {
    expect(() => transactionServiceConfig(999, { NODE_ENV: "test" })).toThrow(
      "SAFE_TX_SERVICE_URL_999 is required for this chain.",
    );
  });
});
