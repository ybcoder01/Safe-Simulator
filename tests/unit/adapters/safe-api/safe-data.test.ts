import { describe, expect, it, vi } from "vitest";

import type { Address, ChainId, SafeRef } from "../../../../src/core/domain";
import {
  balanceRequestConfig,
  normalizeDecodedData,
  normalizeDiscoveredSafes,
  SAFE_API_MAX_ATTEMPTS,
  SAFE_API_RETRY_BASE_MS,
  transactionServiceConfig,
  withSafeApiRetry,
} from "../../../../src/adapters/safe-api/safe-data";

describe("withSafeApiRetry", () => {
  it("honors Retry-After and succeeds after a rate limit", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce({
        response: { status: 429, headers: { "retry-after": "2" } },
      })
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withSafeApiRetry(operation, sleep)).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("uses capped attempts and exponential delays before surfacing a 429", async () => {
    const rateLimitError = { response: { status: 429 } };
    const operation = vi.fn().mockRejectedValue(rateLimitError);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withSafeApiRetry(operation, sleep)).rejects.toBe(
      rateLimitError,
    );

    expect(operation).toHaveBeenCalledTimes(SAFE_API_MAX_ATTEMPTS);
    expect(sleep).toHaveBeenNthCalledWith(1, SAFE_API_RETRY_BASE_MS);
    expect(sleep).toHaveBeenNthCalledWith(2, SAFE_API_RETRY_BASE_MS * 2);
  });

  it("does not retry non-rate-limit failures", async () => {
    const failure = new Error("upstream unavailable");
    const operation = vi.fn().mockRejectedValue(failure);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(withSafeApiRetry(operation, sleep)).rejects.toBe(failure);

    expect(operation).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });
});

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

describe("balanceRequestConfig", () => {
  const safe: SafeRef = {
    chainId: 50 as ChainId,
    address: "0x000000000000000000000000000000000000dead" as Address,
  };

  it("uses a checksummed address and bearer authentication", () => {
    expect(
      balanceRequestConfig(safe, {
        NODE_ENV: "test",
        SAFE_API_KEY: "test-key",
      }),
    ).toEqual({
      headers: { Authorization: "Bearer test-key" },
      url: "https://api.safe.global/tx-service/xdc/api/v1/safes/0x000000000000000000000000000000000000dEaD/balances/",
    });
  });

  it("supports custom services without adding authentication", () => {
    expect(
      balanceRequestConfig(
        { ...safe, chainId: 999 as ChainId },
        {
          NODE_ENV: "test",
          SAFE_TX_SERVICE_URL_999: "https://safe.example/api/",
        },
      ),
    ).toEqual({
      url: "https://safe.example/api/v1/safes/0x000000000000000000000000000000000000dEaD/balances/",
    });
  });
});

describe("normalizeDiscoveredSafes", () => {
  it("deduplicates valid service addresses and drops malformed entries", () => {
    expect(
      normalizeDiscoveredSafes(50, [
        "0x1111111111111111111111111111111111111111",
        "0x1111111111111111111111111111111111111111",
        "not-an-address",
        "0x2222222222222222222222222222222222222222",
      ]),
    ).toEqual([
      {
        chainId: 50,
        address: "0x1111111111111111111111111111111111111111",
      },
      {
        chainId: 50,
        address: "0x2222222222222222222222222222222222222222",
      },
    ]);
  });
});

describe("normalizeDecodedData", () => {
  it("preserves parameters and recursively normalizes decoded batch calls", () => {
    expect(
      normalizeDecodedData({
        method: "multiSend",
        parameters: [
          {
            name: "transactions",
            type: "bytes",
            value: "0x1234",
            valueDecoded: [
              {
                to: "0x1111111111111111111111111111111111111111",
                value: "0",
                data: "0x095ea7b3",
                operation: 1,
                dataDecoded: {
                  method: "approve",
                  parameters: [
                    {
                      name: "spender",
                      type: "address",
                      value: "0x2222222222222222222222222222222222222222",
                    },
                  ],
                },
              },
            ],
          },
        ],
      })
        .parameters.at(0)
        ?.nestedCalls.at(0),
    ).toMatchObject({
      method: "approve",
      to: "0x1111111111111111111111111111111111111111",
      value: "0",
      data: "0x095ea7b3",
      operation: "delegatecall",
      parameters: [
        {
          name: "spender",
          type: "address",
          value: "0x2222222222222222222222222222222222222222",
          nestedCalls: [],
        },
      ],
    });
  });
});
