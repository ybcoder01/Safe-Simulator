import { describe, expect, it } from "vitest";

import nextConfig, {
  contentSecurityPolicy,
  safeAppContentSecurityPolicy,
  safeAppSecurityHeaders,
  securityHeaders,
} from "../../../next.config";

describe("security response headers", () => {
  it("keeps the public application unframeable and isolates the Safe App route", async () => {
    await expect(nextConfig.headers?.()).resolves.toEqual([
      { source: "/safe-app/:path*", headers: safeAppSecurityHeaders },
      {
        source: "/:path((?!safe-app(?:/|$)).*)",
        headers: securityHeaders,
      },
    ]);
  });

  it("restricts executable and embeddable content to the application", () => {
    expect(contentSecurityPolicy).toContain("default-src 'self'");
    expect(contentSecurityPolicy).toContain(
      "connect-src 'self' https://auth.privy.io https://explorer-api.walletconnect.com wss://relay.walletconnect.com",
    );
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("script-src-attr 'none'");
    expect(contentSecurityPolicy).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy).not.toContain("http:");
    expect(contentSecurityPolicy).not.toContain("connect-src *");
  });

  it("allows only Safe Global to frame the preview Safe App", () => {
    expect(safeAppContentSecurityPolicy).toContain(
      "frame-ancestors https://app.safe.global",
    );
    expect(safeAppContentSecurityPolicy).not.toContain("frame-ancestors 'none'");
    expect(safeAppSecurityHeaders).not.toContainEqual(
      expect.objectContaining({ key: "X-Frame-Options" }),
    );
    expect(
      Object.fromEntries(
        safeAppSecurityHeaders.map(({ key, value }) => [key, value]),
      ),
    ).toMatchObject({
      "Content-Security-Policy": safeAppContentSecurityPolicy,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
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
