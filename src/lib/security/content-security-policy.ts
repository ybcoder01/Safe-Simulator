const connectSources = [
  "'self'",
  "https://auth.privy.io",
  "https://explorer-api.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://pulse.walletconnect.org",
  "https://echo.walletconnect.com",
  "wss://relay.walletconnect.com",
  "wss://relay.walletconnect.org",
];

export function contentSecurityPolicy(nonce: string, safeApp: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self'",
    "form-action 'self'",
    "img-src 'self' data:",
    "manifest-src 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "upgrade-insecure-requests",
    safeApp
      ? "frame-ancestors https://app.safe.global"
      : "frame-ancestors 'none'",
  ].join("; ");
}
