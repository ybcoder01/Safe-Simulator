import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyPrivyWallet: vi.fn(),
  claimProfileIdentity: vi.fn(),
}));

vi.mock("@/container", () => ({
  getPersistencePort: () => ({
    claimProfileIdentity: mocks.claimProfileIdentity,
  }),
}));
vi.mock("@/lib/auth/privy", () => ({
  verifyPrivyWallet: mocks.verifyPrivyWallet,
}));

import { POST } from "@/app/api/v1/auth/session/route";

describe("wallet session route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not expose configuration names or values in login errors", async () => {
    mocks.verifyPrivyWallet.mockRejectedValue(
      new Error("PRIVY_APP_SECRET not configured: super-secret"),
    );
    const response = await POST(
      new NextRequest("https://safe.example/api/v1/auth/session", {
        method: "POST",
        body: JSON.stringify({
          walletAddress: "0x1111111111111111111111111111111111111111",
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toBe("Wallet login is temporarily unavailable.");
    expect(JSON.stringify(body)).not.toContain("PRIVY_APP_SECRET");
    expect(JSON.stringify(body)).not.toContain("super-secret");
  });
});
