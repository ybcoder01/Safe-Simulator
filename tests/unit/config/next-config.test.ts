import { describe, expect, it } from "vitest";

import nextConfig, { securityHeaders } from "../../../next.config";

describe("security response headers", () => {
  it("applies the hardened policy to every route", async () => {
    await expect(nextConfig.headers?.()).resolves.toEqual([
      { source: "/:path*", headers: securityHeaders },
    ]);
  });

  it("prevents framing, sniffing, and unnecessary browser capabilities", () => {
    expect(
      Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value])),
    ).toMatchObject({
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
