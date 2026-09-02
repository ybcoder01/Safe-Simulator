import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL;
const environment = process.env.SMOKE_ENVIRONMENT;
const timeoutMs = 15_000;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN;
const testSafe = {
  chainId: 50,
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
};
const profileCookie = `safe-inspector-profile=${crypto.randomUUID()}`;

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
  { allowFailure = false, method = "GET", json, includeProfile = false } = {},
) {
  const url = new URL(pathname, base);
  const headers = {
    "User-Agent": "safe-inspector-preview-smoke",
    "x-vercel-trusted-oidc-idp-token": oidcToken,
  };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  if (includeProfile) headers.Cookie = profileCookie;

  const response = await fetch(url, {
    method,
    headers,
    body: json === undefined ? undefined : JSON.stringify(json),
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });

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
assert.match(safesHtml, /Safe accounts/);
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

const safePath = `/api/v1/safes/${testSafe.chainId}/${testSafe.address}`;
let lifecycleStarted = false;

try {
  lifecycleStarted = true;
  const importResponse = await request("/api/v1/safes", {
    allowFailure: true,
    method: "POST",
    json: testSafe,
    includeProfile: true,
  });
  const importBody = await importResponse.json();
  assert.equal(
    importResponse.status,
    201,
    `Safe import returned HTTP ${importResponse.status}: ${JSON.stringify(importBody)}`,
  );
  assert.equal(importBody.data?.chainId, testSafe.chainId);
  assert.equal(
    importBody.data?.address?.toLowerCase(),
    testSafe.address.toLowerCase(),
  );

  const watchlistResponse = await request("/api/v1/safes", {
    includeProfile: true,
  });
  const watchlistBody = await watchlistResponse.json();
  assert.ok(
    watchlistBody.data?.some(
      (safe) =>
        safe.chainId === testSafe.chainId &&
        safe.address.toLowerCase() === testSafe.address.toLowerCase(),
    ),
    "The imported Safe was not returned for the temporary Preview profile.",
  );

  const detailsResponse = await request(safePath, { includeProfile: true });
  const detailsBody = await detailsResponse.json();
  assert.equal(detailsBody.data?.safe?.chainId, testSafe.chainId);
  assert.equal(
    detailsBody.data?.safe?.address?.toLowerCase(),
    testSafe.address.toLowerCase(),
  );
} finally {
  if (lifecycleStarted) {
    const deleteResponse = await request(safePath, {
      allowFailure: true,
      method: "DELETE",
      includeProfile: true,
    });
    assert.equal(
      deleteResponse.status,
      204,
      `Safe cleanup returned HTTP ${deleteResponse.status}.`,
    );

    const cleanedWatchlistResponse = await request("/api/v1/safes", {
      includeProfile: true,
    });
    const cleanedWatchlistBody = await cleanedWatchlistResponse.json();
    assert.ok(
      !cleanedWatchlistBody.data?.some(
        (safe) =>
          safe.chainId === testSafe.chainId &&
          safe.address.toLowerCase() === testSafe.address.toLowerCase(),
      ),
      "The temporary Preview bookmark still exists after cleanup.",
    );
  }
}

console.log(
  JSON.stringify({
    deployment: base.origin,
    checks: [
      "home",
      "security-headers",
      "safes",
      "database",
      "cache",
      "safe-import",
      "safe-readback",
      "bookmark-cleanup",
    ],
    status: "ok",
  }),
);
