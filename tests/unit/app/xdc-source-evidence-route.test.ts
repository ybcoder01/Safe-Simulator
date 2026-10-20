import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolve = vi.fn();
const checkRateLimit = vi.fn();

vi.mock("@/container", () => ({
  getCachePort: () => ({ get: vi.fn(), set: vi.fn() }),
  getRateLimitPort: () => ({}),
}));
vi.mock("@/lib/api/xdcscan-verification", () => ({
  resolveXdcContractVerification: (...args: unknown[]) => resolve(...args),
}));
vi.mock("@/lib/api/rate-limit", () => ({
  XDC_SOURCE_EVIDENCE_RATE_LIMIT: { scope: "x", limit: 1, windowSeconds: 1 },
  checkRequestRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  rateLimitHeaders: () => ({}),
}));

import { POST } from "@/app/api/v1/xdc-source-evidence/route";
import { sourceEvidenceRequestBody } from "@/lib/api/xdc-source-evidence-request";

const router = "0x4fFf70C17fb974121a1Ad64C97b04a2e38DbfE7C";

function request(body: unknown, origin = "http://localhost") {
  return new NextRequest("http://localhost/api/v1/xdc-source-evidence", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/v1/xdc-source-evidence", () => {
  beforeEach(() => {
    resolve.mockReset().mockResolvedValue({ items: [] });
    checkRateLimit
      .mockReset()
      .mockResolvedValue({ allowed: true, degraded: false });
  });

  it("rejects cross-origin requests before doing any work", async () => {
    const response = await POST(
      request({ addresses: [router] }, "https://evil.example"),
    );
    expect(response.status).toBe(403);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects missing, malformed and oversized address lists", async () => {
    for (const body of [
      {},
      { addresses: [] },
      { addresses: ["0x123"] },
      { addresses: Array(17).fill(router) },
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it("stops when the caller is rate limited", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, degraded: false });
    expect((await POST(request({ addresses: [router] }))).status).toBe(429);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("looks the first address up with its own timeout and returns the result", async () => {
    const response = await POST(request({ addresses: [router] }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { items: [] } });
    expect(resolve).toHaveBeenCalledWith(
      expect.anything(),
      50,
      [router],
      expect.any(Function),
      { priorityAddresses: [router] },
    );
  });

  it("accepts the body the browser builds for a transaction with more than 16 references", async () => {
    const references = Array.from(
      { length: 20 },
      (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`,
    );

    const response = await POST(request(sourceEvidenceRequestBody(references)));

    expect(response.status).toBe(200);
    expect(resolve.mock.calls[0]?.[2]).toEqual(references.slice(0, 16));
  });
});
