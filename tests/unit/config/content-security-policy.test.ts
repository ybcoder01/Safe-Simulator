import { describe, expect, it } from "vitest";

import { contentSecurityPolicy } from "@/lib/security/content-security-policy";

describe("nonce content security policy", () => {
  it("permits only nonce-bearing scripts and blocks public framing", () => {
    const policy = contentSecurityPolicy("test-nonce", false);

    expect(policy).toContain(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic'",
    );
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("script-src-attr 'none'");
    expect(policy).not.toContain("'unsafe-inline' 'strict-dynamic'");
    expect(policy.match(/unsafe-inline/g)).toHaveLength(1);
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows only Safe Global to frame the Safe App", () => {
    const policy = contentSecurityPolicy("test-nonce", true);

    expect(policy).toContain("frame-ancestors https://app.safe.global");
    expect(policy).not.toContain("frame-ancestors 'none'");
  });
});
