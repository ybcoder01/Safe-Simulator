import { describe, expect, it } from "vitest";

import nextConfig, {
  legacyLiveExamplePath,
  liveExamplePath,
  safeAppSecurityHeaders,
  securityHeaders,
} from "../../../next.config";

describe("security response headers", () => {
  it("records that the framework received its security upgrade", () => {
    expect(nextConfig.experimental?.agentUpgrade).toBe("security");
  });

  it("redirects the retired public demo to the current live example", async () => {
    await expect(nextConfig.redirects?.()).resolves.toEqual([
      {
        source: legacyLiveExamplePath,
        destination: liveExamplePath,
        permanent: true,
      },
    ]);
  });

  it("keeps the public application unframeable and isolates the Safe App route", async () => {
    await expect(nextConfig.headers?.()).resolves.toEqual([
      { source: "/safe-app/:path*", headers: safeAppSecurityHeaders },
      {
        source: "/:path((?!safe-app(?:/|$)).*)",
        headers: securityHeaders,
      },
    ]);
  });

  it("allows the Safe App route to be framed only through its nonce CSP", () => {
    expect(safeAppSecurityHeaders).not.toContainEqual(
      expect.objectContaining({ key: "X-Frame-Options" }),
    );
    expect(
      Object.fromEntries(
        safeAppSecurityHeaders.map(({ key, value }) => [key, value]),
      ),
    ).toMatchObject({
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
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
