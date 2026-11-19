import assert from "node:assert/strict";

import liveExample from "../src/lib/public-live-example.json" with { type: "json" };

const baseUrl = process.env.SMOKE_BASE_URL;
const environment = process.env.SMOKE_ENVIRONMENT;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN;
const timeoutMs = 30_000;
const stablePreviewOrigin = "https://safe-simulator.vercel.app";
const productionOrigin = "https://safe-inspector.vercel.app";

const liveExamplePath = `/safe/${liveExample.chainId}/${liveExample.safe}/tx/${liveExample.safeTxHash}`;

assert.equal(
  environment,
  "preview",
  "Refusing to run unless SMOKE_ENVIRONMENT is exactly preview.",
);
assert.ok(baseUrl, "SMOKE_BASE_URL is required.");

const base = new URL(baseUrl);
assert.equal(base.protocol, "https:", "Preview smoke tests require HTTPS.");
assert.ok(
  base.hostname.endsWith(".vercel.app"),
  "Preview smoke tests only accept a vercel.app deployment URL.",
);
assert.notEqual(
  base.origin,
  productionOrigin,
  "Refusing to run in production.",
);
assert.ok(
  oidcToken || base.origin === stablePreviewOrigin,
  "VERCEL_TRUSTED_OIDC_TOKEN is required for protected Preview deployments.",
);

async function request(
  pathname,
  { allowFailure = false, method = "GET", json } = {},
) {
  const url = new URL(pathname, base);
  const headers = { "User-Agent": "safe-inspector-preview-smoke" };
  if (oidcToken) headers["x-vercel-trusted-oidc-idp-token"] = oidcToken;
  if (json !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  });

  assert.ok(
    response.status < 300 || response.status >= 400,
    `${pathname} attempted an HTTP redirect.`,
  );
  assert.equal(
    new URL(response.url).origin,
    base.origin,
    `${pathname} escaped the selected Preview origin.`,
  );

  if (!allowFailure) {
    assert.equal(
      response.status,
      200,
      `${pathname} returned HTTP ${response.status}.`,
    );
  }
  return response;
}

const home = await request("/");
const homeHtml = await home.text();
assert.match(homeHtml, /Safe Inspector/);
assert.match(homeHtml, /Understand every action/);
assert.match(
  home.headers.get("content-security-policy") ?? "",
  /frame-ancestors 'none'/,
);
assert.equal(home.headers.get("x-content-type-options"), "nosniff");
assert.equal(home.headers.get("x-frame-options"), "DENY");
assert.equal(
  home.headers.get("referrer-policy"),
  "strict-origin-when-cross-origin",
);

const safes = await request("/safes");
const safesHtml = await safes.text();
assert.match(
  safesHtml,
  /Checking wallet session|Wallet login is not configured/,
);
assert.match(safesHtml, /Read-only by design/);

const apothemLab = await request("/demo/apothem-attack-lab");
const apothemLabHtml = await apothemLab.text();
assert.match(apothemLabHtml, /Malicious transaction testnet lab/);
assert.match(apothemLabHtml, /XDC Apothem · Chain ID 51/);
assert.match(apothemLabHtml, /Strict testnet boundary/);

const health = await request("/api/health", { allowFailure: true });
assert.match(health.headers.get("content-type") ?? "", /application\/json/);
const healthBody = await health.json();
assert.equal(
  health.status,
  200,
  `/api/health returned HTTP ${health.status}: ${JSON.stringify({
    status: healthBody.status,
    checks: healthBody.checks,
  })}`,
);
assert.equal(healthBody.service, "safe-inspector");
assert.equal(healthBody.status, "ok");
assert.equal(typeof healthBody.timestamp, "string");
assert.equal(
  Object.hasOwn(healthBody, "checks"),
  false,
  "Public health output must not expose dependency diagnostics.",
);

// Personal Safe data is wallet-authenticated now. The smoke test intentionally
// has no wallet and must prove that the server boundary rejects both reads and
// writes instead of reviving the old anonymous browser-profile lifecycle.
const anonymousWatchlist = await request("/api/v1/safes", {
  allowFailure: true,
});
assert.equal(anonymousWatchlist.status, 401);
assert.equal(
  (await anonymousWatchlist.json()).error?.code,
  "authentication_required",
);

const anonymousImport = await request("/api/v1/safes", {
  allowFailure: true,
  method: "POST",
  json: {
    chainId: 1,
    address: "0xcd2E72aEBe2A203b84f46DEEC948E6465dB51c75",
  },
});
assert.equal(anonymousImport.status, 401);
assert.equal(
  (await anonymousImport.json()).error?.code,
  "authentication_required",
);

// The homepage's signed-out demo is a product boundary, not merely a link.
// Require both the public API and rendered report so a stale fixture cannot
// silently ship as a visitor-facing 404.
const publicReportApi = await request(
  `/api/v1/safes/${liveExample.chainId}/${liveExample.safe}/tx/${liveExample.safeTxHash}`,
);
const publicReport = (await publicReportApi.json()).data;
assert.equal(publicReport?.safeTxHash, liveExample.safeTxHash);
assert.equal(publicReport?.to, liveExample.target);
assert.equal(publicReport?.status, "executed");
assert.equal(publicReport?.activity?.label, "Supply to lending market");

const publicReportPage = await request(liveExamplePath);
const publicReportHtml = await publicReportPage.text();
assert.match(publicReportHtml, new RegExp(liveExample.safeTxHash));
assert.match(publicReportHtml, /Supply to lending market/);

console.log(
  JSON.stringify({
    deployment: base.origin,
    checks: [
      "home",
      "security-headers",
      "wallet-auth-boundary",
      "apothem-attack-lab",
      "non-leaking-health",
      "anonymous-watchlist-denied",
      "anonymous-import-denied",
      "public-live-example-api",
      "public-live-example-page",
    ],
    status: "ok",
  }),
);
