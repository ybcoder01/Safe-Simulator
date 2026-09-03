import assert from "node:assert/strict";

const baseUrl = process.env.SMOKE_BASE_URL;
const environment = process.env.SMOKE_ENVIRONMENT;
const timeoutMs = 15_000;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN;
const testSafe = {
  chainId: 1,
  address: "0xcd2E72aEBe2A203b84f46DEEC948E6465dB51c75",
};
const expectedTransaction = {
  safeTxHash:
    "0xe833903006ab324b150a200576489c11a9e066815ed6129468151f68f7753191",
  executedTxHash:
    "0xd8380efcc29948d044ca206dd2816c7da85d2bd7b3db7d0512c976647fef79aa",
  nonce: "53",
  token: "0x5aFE3855358E112B5647B952709E6165e1c1eEEe",
  recipient: "0xA1b02d8c67b0FDCF4E379855868DeB470E169cfB",
  amount: "118000000000000000000",
  summary: "Transfer 118000000000000000000 base units to 0xa1b02d…169cfb",
};
const transactionPollTimeoutMs = 90_000;
const transactionPollIntervalMs = 3_000;
const syncPollTimeoutMs = 120_000;
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

async function waitForAnalyzedTransaction(pathname) {
  const deadline = Date.now() + transactionPollTimeoutMs;
  let lastState = "not returned";

  while (Date.now() < deadline) {
    const response = await request(`${pathname}/transactions?limit=25`, {
      includeProfile: true,
    });
    const body = await response.json();
    const transaction = body.data?.find(
      (item) =>
        item.safeTxHash.toLowerCase() ===
        expectedTransaction.safeTxHash.toLowerCase(),
    );

    if (transaction?.analysis) return transaction;
    lastState = transaction ? "returned without analysis" : "not returned";
    await new Promise((resolve) =>
      setTimeout(resolve, transactionPollIntervalMs),
    );
  }

  assert.fail(
    `Expected transaction was ${lastState} after ${transactionPollTimeoutMs}ms.`,
  );
}

async function waitForSyncCompletion(pathname, after = null) {
  const deadline = Date.now() + syncPollTimeoutMs;
  let lastState = "not returned";

  while (Date.now() < deadline) {
    const response = await request(pathname, { includeProfile: true });
    const body = await response.json();
    const sync = body.data?.sync;
    lastState = JSON.stringify(sync ?? null);

    if (
      sync?.status === "complete" &&
      sync.completedStreams === 4 &&
      sync.totalStreams === 4 &&
      sync.lastFullSyncAt !== null &&
      (after === null || sync.lastFullSyncAt >= after)
    ) {
      return sync;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, transactionPollIntervalMs),
    );
  }

  assert.fail(
    `Four-stream synchronization did not complete after ${syncPollTimeoutMs}ms. Last state: ${lastState}.`,
  );
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
const refreshPath = `${safePath}/refresh`;
const unbookmarkedRefresh = await request(refreshPath, {
  allowFailure: true,
  method: "POST",
  includeProfile: true,
});
assert.equal(
  unbookmarkedRefresh.status,
  404,
  "A profile without the Safe bookmark was allowed to queue a refresh.",
);

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

  const listedTransaction = await waitForAnalyzedTransaction(safePath);
  assert.equal(listedTransaction.nonce, expectedTransaction.nonce);
  assert.equal(
    listedTransaction.to.toLowerCase(),
    expectedTransaction.token.toLowerCase(),
  );
  assert.equal(listedTransaction.operation, "call");
  assert.equal(listedTransaction.status, "executed");
  assert.equal(listedTransaction.summary, expectedTransaction.summary);
  assert.equal(listedTransaction.analysis?.baselineVerdict, "unverified");

  const transactionResponse = await request(
    `${safePath}/tx/${expectedTransaction.safeTxHash}`,
    { includeProfile: true },
  );
  const transactionBody = await transactionResponse.json();
  const transaction = transactionBody.data;
  assert.equal(
    transaction.safeTxHash.toLowerCase(),
    expectedTransaction.safeTxHash.toLowerCase(),
  );
  assert.equal(
    transaction.executedTxHash.toLowerCase(),
    expectedTransaction.executedTxHash.toLowerCase(),
  );
  assert.equal(transaction.confirmations?.length, 1);
  assert.equal(
    transaction.confirmations[0]?.owner?.toLowerCase(),
    expectedTransaction.recipient.toLowerCase(),
  );
  assert.equal(transaction.insight?.decoded?.method, "transfer");
  assert.equal(transaction.insight?.provenance, "safe-service");
  assert.equal(transaction.execution?.mode, "executed-replay");
  assert.equal(transaction.execution?.success, true);
  assert.equal(transaction.execution?.coverage?.outcome, "on-chain-receipt");
  assert.equal(transaction.execution?.coverage?.tokenEvents, "standard-events");
  assert.ok(
    ["complete", "partial", "root-only"].includes(
      transaction.execution?.coverage?.callTrace,
    ),
    "Call-trace coverage was not reported explicitly.",
  );
  assert.ok(
    ["complete", "partial", "unavailable"].includes(
      transaction.execution?.coverage?.storageDiff,
    ),
    "Storage-diff coverage was not reported explicitly.",
  );
  assert.ok(
    transaction.execution?.tokenMovements?.some(
      (movement) =>
        movement.token.toLowerCase() ===
          expectedTransaction.token.toLowerCase() &&
        movement.from.toLowerCase() === testSafe.address.toLowerCase() &&
        movement.to.toLowerCase() ===
          expectedTransaction.recipient.toLowerCase() &&
        movement.amount === expectedTransaction.amount &&
        movement.direction === "outbound",
    ),
    "Expected receipt-backed SAFE token movement was not found.",
  );
  assert.deepEqual(transaction.approvalRisk?.requests, []);
  assert.equal(transaction.verdict?.verdict, "unverified");
  assert.ok(
    transaction.verdict?.findings?.some(
      (finding) => finding.code === "movement-trust-unresolved",
    ),
    "The unresolved recipient finding was not preserved.",
  );
  assert.ok(
    transaction.verdict?.findings?.some(
      (finding) => finding.code === "partial-analysis-coverage",
    ),
    "The bounded coverage finding was not preserved.",
  );
  assert.ok(
    !transaction.verdict?.findings?.some(
      (finding) => finding.severity === "critical",
    ),
    "The fixed successful transfer unexpectedly produced critical evidence.",
  );

  const initialSync = await waitForSyncCompletion(safePath);
  const refreshResponse = await request(refreshPath, {
    allowFailure: true,
    method: "POST",
    includeProfile: true,
  });
  const refreshBody = await refreshResponse.json();
  assert.equal(
    refreshResponse.status,
    202,
    `Safe refresh returned HTTP ${refreshResponse.status}: ${JSON.stringify(refreshBody)}`,
  );
  assert.equal(refreshBody.data?.status, "queued");
  assert.equal(typeof refreshBody.data?.requestedAt, "number");

  const duplicateResponse = await request(refreshPath, {
    allowFailure: true,
    method: "POST",
    includeProfile: true,
  });
  const duplicateBody = await duplicateResponse.json();
  assert.equal(
    duplicateResponse.status,
    202,
    `Duplicate refresh returned HTTP ${duplicateResponse.status}: ${JSON.stringify(duplicateBody)}`,
  );
  assert.equal(
    duplicateBody.data?.status,
    "running",
    "A second request created parallel refresh work instead of joining the active run.",
  );

  const refreshedSync = await waitForSyncCompletion(
    safePath,
    Math.floor(refreshBody.data.requestedAt / 1_000),
  );
  assert.ok(
    refreshedSync.lastFullSyncAt >= initialSync.lastFullSyncAt,
    "Refresh completion moved the full-sync timestamp backwards.",
  );

  const persistedTransaction = await waitForAnalyzedTransaction(safePath);
  assert.equal(
    persistedTransaction.safeTxHash.toLowerCase(),
    expectedTransaction.safeTxHash.toLowerCase(),
  );
  assert.equal(persistedTransaction.analysis?.baselineVerdict, "unverified");
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
      "transaction-ingestion",
      "transaction-analysis",
      "receipt-evidence",
      "verdict-boundary",
      "four-stream-sync",
      "refresh-profile-boundary",
      "profile-authorized-refresh",
      "refresh-deduplication",
      "post-refresh-analysis-persistence",
      "bookmark-cleanup",
    ],
    status: "ok",
  }),
);
