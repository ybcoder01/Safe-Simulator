import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAuthSession, parseAuthSession } from "@/lib/auth/session";

const originalSecret = process.env.PRIVY_APP_SECRET;

describe("wallet authentication session", () => {
  beforeEach(() => {
    process.env.PRIVY_APP_SECRET = "test-secret-that-is-not-used-in-production";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.PRIVY_APP_SECRET;
    else process.env.PRIVY_APP_SECRET = originalSecret;
  });

  it("round-trips a signed external-wallet identity", () => {
    const value = createAuthSession({
      profileId: "d98dcaac-9d20-4210-8f4b-05cb44dd5ff7",
      privyUserId: "did:privy:test-user",
      walletAddress: "0x00000000000000000000000000000000000000aa",
    });

    expect(parseAuthSession(value)).toMatchObject({
      profileId: "d98dcaac-9d20-4210-8f4b-05cb44dd5ff7",
      privyUserId: "did:privy:test-user",
      walletAddress: "0x00000000000000000000000000000000000000aa",
    });
  });

  it("rejects a modified session", () => {
    const value = createAuthSession({
      profileId: "d98dcaac-9d20-4210-8f4b-05cb44dd5ff7",
      privyUserId: "did:privy:test-user",
      walletAddress: "0x00000000000000000000000000000000000000aa",
    });
    const [payload, signature] = value.split(".");

    expect(parseAuthSession(`${payload}x.${signature}`)).toBeNull();
  });
});
