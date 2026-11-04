import type { NextConfig } from "next";

const commonContentSecurityDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  [
    "connect-src 'self'",
    "https://auth.privy.io",
    "https://explorer-api.walletconnect.com",
    "wss://relay.walletconnect.com",
  ].join(" "),
  "font-src 'self'",
  "form-action 'self'",
  "img-src 'self' data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
];

export const contentSecurityPolicy = [
  ...commonContentSecurityDirectives,
  "frame-ancestors 'none'",
].join("; ");

export const safeAppContentSecurityPolicy = [
  ...commonContentSecurityDirectives,
  "frame-ancestors https://app.safe.global",
].join("; ");

const commonSecurityHeaders = [
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

export const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...commonSecurityHeaders,
  { key: "X-Frame-Options", value: "DENY" },
];

export const safeAppSecurityHeaders = [
  {
    key: "Access-Control-Allow-Origin",
    value: "https://app.safe.global",
  },
  { key: "Content-Security-Policy", value: safeAppContentSecurityPolicy },
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
  ...commonSecurityHeaders,
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/safe-app/:path*", headers: safeAppSecurityHeaders },
      {
        source: "/:path((?!safe-app(?:/|$)).*)",
        headers: securityHeaders,
      },
    ];
  },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
