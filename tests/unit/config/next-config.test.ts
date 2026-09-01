import { describe, expect, it } from "vitest";

import nextConfig, {
  contentSecurityPolicy,
  securityHeaders,
} from "../../../next.config";

describe("security response headers", () => {
  it("applies the hardened policy to every route", async () => {
    await expect(nextConfig.headers?.()).resolves.toEqual([
      { source: "/:path*", headers: securityHeaders },
    ]);
  });

  it("restricts executable and embeddable content to the application", () => {
    expect(contentSecurityPolicy).toContain("default-src 'self'");
    expect(contentSecurityPolicy).toContain("connect-src 'self'");
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("script-src-attr 'none'");
    expect(contentSecurityPolicy).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy).not.toContain("http:");
    expect(contentSecurityPolicy).not.toContain("https:");
  });

  it("prevents framing, sniffing, and unnecessary browser capabilities", () => {
    expect(
      Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value])),
    ).toMatchObject({
      "Content-Security-Policy": contentSecurityPolicy,
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Permissions-Policy":
        "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Strict-Transport-Security":
        "max-age=63072000; includeSubDomains; preload",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
  });
});
