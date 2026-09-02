import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL;
const environment = process.env.SMOKE_ENVIRONMENT;
const timeoutMs = 15_000;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN;

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

async function request(pathname) {
  const url = new URL(pathname, base);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "safe-inspector-preview-smoke",
      "x-vercel-trusted-oidc-idp-token": oidcToken,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

  assert.equal(
    response.status,
    200,
    `${pathname} returned HTTP ${response.status}.`,
  );
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
assert.match(safesHtml, /Safe accounts/);
assert.match(safesHtml, /Read-only by design/);

const health = await request("/api/health");
assert.match(health.headers.get("content-type") ?? "", /application\/json/);
const healthBody = await health.json();
assert.equal(healthBody.service, "safe-inspector");
assert.equal(healthBody.status, "ok");
assert.equal(healthBody.checks?.database, "ok");
assert.equal(healthBody.checks?.cache, "ok");

console.log(
  JSON.stringify({
    deployment: base.origin,
    checks: ["home", "security-headers", "safes", "database", "cache"],
    status: "ok",
  }),
);
