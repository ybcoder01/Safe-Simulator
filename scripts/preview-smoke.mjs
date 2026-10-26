import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL;
const environment = process.env.SMOKE_ENVIRONMENT;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN;
const timeoutMs = 30_000;

const approvalSafe = "0x7ae1ef2979b0de85d7dea7f6a5582417d4a98c55";
const approvalHash =
  "0x0e47998fb92ce223105d15e36fa05aac47718baeaca8cc83a16be6e0815036cb";

assert.equal(
  environment,
  "preview",
  "Refusing to run unless SMOKE_ENVIRONMENT is exactly preview.",
);
assert.ok(baseUrl, "SMOKE_BASE_URL is required.");
assert.ok(oidcToken, "VERCEL_TRUSTED_OIDC_TOKEN is required.");

const base = new URL(baseUrl);
assert.equal(base.protocol, "https:", "Preview smoke tests require HTTPS.");
assert.ok(
  base.hostname.endsWith(".vercel.app"),
  "Preview smoke tests only accept a vercel.app deployment URL.",
);
assert.notEqual(
  base.hostname,
  "safe-simulator.vercel.app",
  "Refusing to run against the production domain.",
);

async function request(
  pathname,
  { allowFailure = false, method = "GET", json } = {},
) {
  const url = new URL(pathname, base);
  const headers = {
    "User-Agent": "safe-inspector-preview-smoke",
    "x-vercel-trusted-oidc-idp-token": oidcToken,
  };
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
assert.match(safesHtml, /Checking wallet session/);
assert.match(safesHtml, /Read-only by design/);

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
assert.equal(healthBody.checks?.database, "ok");
assert.equal(healthBody.checks?.cache, "ok");

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

// Public, shareable reports remain available without a login.
const transactionResponse = await request(
  `/api/v1/safes/50/${approvalSafe}/tx/${approvalHash}`,
);
const transaction = (await transactionResponse.json()).data;
assert.equal(transaction.status, "executed");
assert.equal(transaction.execution?.mode, "executed-replay");
assert.equal(transaction.execution?.success, true);
assert.ok(transaction.approvalRisk?.requests?.length > 0);
assert.equal(transaction.approvalRisk.requests[0]?.standard, "erc20");
assert.equal(transaction.approvalRisk.requests[0]?.infinite, false);
assert.match(
  transaction.approvalRisk.requests[0]?.spender ?? "",
  /^0x[0-9a-f]{40}$/i,
);

console.log(
  JSON.stringify({
    deployment: base.origin,
    checks: [
      "home",
      "security-headers",
      "wallet-auth-gate",
      "database",
      "cache",
      "anonymous-watchlist-denied",
      "anonymous-import-denied",
      "public-transaction-report",
      "receipt-evidence",
      "approval-risk",
    ],
    status: "ok",
  }),
);
