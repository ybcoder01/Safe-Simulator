import { describe, expect, it, vi } from "vitest";

import {
  requestTransactionSummary,
  sanitizePublicTransactionEvidence,
  TransactionSummaryProviderError,
} from "@/lib/api/transaction-summary";

const validSummary = {
  headline: "Review this approval",
  plainLanguage: "The transaction changes a token allowance.",
  stance: "manual-review",
  keyActions: ["Sets an allowance for a spender."],
  risks: ["The spender must be independently confirmed."],
  checksBeforeSigning: ["Confirm the token, amount, and spender."],
  limitations: ["Pending state can change before execution."],
} as const;

describe("transaction summary privacy and provider boundary", () => {
  it("removes signing and profile fields while bounding public values", () => {
    const evidence = sanitizePublicTransactionEvidence({
      calldata: "0x" + "ab".repeat(2_000),
      confirmations: [{ signature: "0xsecret" }],
      profileId: "private",
      nested: {
        cookie: "private",
        publicAddress: "0x0000000000000000000000000000000000000001",
      },
      items: Array.from({ length: 40 }, (_, index) => index),
    });
    const serialized = JSON.stringify(evidence);

    expect(serialized).not.toContain("0xsecret");
    expect(serialized).not.toContain("private");
    expect((evidence.items as readonly number[]).length).toBe(24);
    expect(String(evidence.calldata)).toContain("[truncated]");
  });

  it("requires private routing controls and strict structured output", async () => {
    const fetcher = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          provider: Record<string, unknown>;
          response_format: { type: string; json_schema: { strict: boolean } };
          temperature?: unknown;
          max_tokens?: unknown;
          max_completion_tokens?: unknown;
        };

        expect(body.provider).toEqual({
          data_collection: "deny",
          zdr: true,
          require_parameters: true,
        });
        expect(body.response_format.type).toBe("json_schema");
        expect(body.response_format.json_schema.strict).toBe(true);
        expect(body).not.toHaveProperty("temperature");
        expect(body).not.toHaveProperty("max_tokens");
        expect(body.max_completion_tokens).toBe(900);
        expect(init?.signal).toBeInstanceOf(AbortSignal);

        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(validSummary) } }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 40,
              total_tokens: 140,
            },
          }),
          { status: 200 },
        );
      },
    );

    const result = await requestTransactionSummary(
      { transaction: { safeTxHash: "0x1" } },
      { apiKey: "test-key", model: "openai/gpt-5.4-mini", fetcher },
    );

    expect(result.summary).toEqual(validSummary);
    expect(result.usage.totalTokens).toBe(140);
    expect(fetcher).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("keeps provider rejection diagnostics bounded to the HTTP status", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "untrusted detail" } }),
          { status: 404 },
        ),
    );

    await expect(
      requestTransactionSummary(
        {},
        { apiKey: "test-key", model: "openai/gpt-5.4-mini", fetcher },
      ),
    ).rejects.toMatchObject({
      code: "provider_rejected",
      message: "The summary provider returned HTTP 404.",
      providerStatus: 404,
    } satisfies Partial<TransactionSummaryProviderError>);
  });

  it("rejects provider content outside the required schema", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: JSON.stringify({ headline: "Only" }) } },
            ],
          }),
          { status: 200 },
        ),
    );

    await expect(
      requestTransactionSummary(
        {},
        { apiKey: "test-key", model: "openai/gpt-5.4-mini", fetcher },
      ),
    ).rejects.toMatchObject({
      code: "invalid_response",
    } satisfies Partial<TransactionSummaryProviderError>);
  });
});
