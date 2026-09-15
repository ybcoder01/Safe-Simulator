import assert from "node:assert/strict";

const requiredOrigin = "https://safe-simulator.vercel.app";
const environment = process.env.SOAK_ENVIRONMENT;
const baseUrl = process.env.SOAK_BASE_URL;
const requestTimeoutMs = 10_000;

const reference = {
  chainId: 50,
  safe: "0x7ae1ef2979b0de85d7dea7f6a5582417d4a98c55",
  safeTxHash:
    "0x0856c4f2890b3828981c29e6e09f4e475c6439ae2045837bcb38900b5249a633",
  target: "0x9641d764fc13c8b624c04430c7356c1c7c8102e2",
};

assert.equal(
  environment,
  "production",
  "Refusing to run unless SOAK_ENVIRONMENT is exactly production.",
);
assert.ok(baseUrl, "SOAK_BASE_URL is required.");

const base = new URL(baseUrl);
assert.equal(
  base.origin,
  requiredOrigin,
  `Refusing to run against any origin except ${requiredOrigin}.`,
);
assert.equal(base.pathname, "/", "SOAK_BASE_URL must not include a path.");
assert.equal(base.search, "", "SOAK_BASE_URL must not include a query.");
assert.equal(base.hash, "", "SOAK_BASE_URL must not include a fragment.");
assert.equal(base.username, "", "SOAK_BASE_URL must not include credentials.");
assert.equal(base.password, "", "SOAK_BASE_URL must not include credentials.");

const safePath = `/safe/${reference.chainId}/${reference.safe}`;
const transactionPath = `${safePath}/tx/${reference.safeTxHash}`;

const checks = [
  {
    name: "Safe detail API",
    path: `/api/v1/safes/${reference.chainId}/${reference.safe}`,
    accept: "application/json",
    async validate(response) {
      assert.match(
        response.headers.get("content-type") ?? "",
        /application\/json/,
      );
      const body = await response.json();
      assert.equal(body.data?.safe?.chainId, reference.chainId);
      assert.equal(body.data?.safe?.address, reference.safe);
      assert.equal(body.data?.sync?.status, "complete");
      assert.equal(body.data?.sync?.completedStreams, 4);
      assert.equal(body.data?.sync?.totalStreams, 4);
      assert.ok(
        Array.isArray(body.data?.transactions),
        "Safe detail response must include transaction history.",
      );
    },
  },
  {
    name: "Transaction analysis API",
    path: `/api/v1/safes/${reference.chainId}/${reference.safe}/tx/${reference.safeTxHash}`,
    accept: "application/json",
    async validate(response) {
      assert.match(
        response.headers.get("content-type") ?? "",
        /application\/json/,
      );
      const transaction = (await response.json()).data;
      assert.equal(transaction?.safe?.chainId, reference.chainId);
      assert.equal(transaction?.safe?.address, reference.safe);
      assert.equal(transaction?.safeTxHash, reference.safeTxHash);
      assert.equal(transaction?.to, reference.target);
      assert.equal(transaction?.status, "executed");
      assert.equal(transaction?.operation, "delegatecall");
      assert.equal(transaction?.execution?.mode, "executed-replay");
      assert.equal(transaction?.execution?.success, true);
      assert.equal(
        transaction?.execution?.coverage?.outcome,
        "on-chain-receipt",
      );
      assert.equal(transaction?.execution?.coverage?.callTrace, "complete");
      assert.equal(transaction?.execution?.coverage?.eventLogs, "complete");
      assert.equal(transaction?.execution?.coverage?.storageDiff, "complete");
      assert.equal(transaction?.verdict?.verdict, "flagged");
      assert.equal(
        transaction?.verdict?.headline,
        "Critical evidence requires review",
      );
    },
  },
  {
    name: "Safe dashboard",
    path: safePath,
    accept: "text/html,application/xhtml+xml",
    async validate(response) {
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      const body = await response.text();
      assert.match(body, /Safe dashboard/);
      assert.match(body, /Transaction history/);
      assert.match(body, /Read-only by design/);
    },
  },
  {
    name: "Transaction review",
    path: transactionPath,
    accept: "text/html,application/xhtml+xml",
    async validate(response) {
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      const body = await response.text();
      assert.match(body, new RegExp(reference.safeTxHash));
      assert.match(body, /Safe batch/);
      assert.match(body, /Critical evidence requires review/);
      assert.match(body, /Read-only by design/);
    },
  },
];

function safeErrorMessage(error) {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

async function runCheck(check) {
  const url = new URL(check.path, base);
  assert.equal(url.origin, requiredOrigin);
  assert.equal(url.pathname, check.path);

  const startedAt = performance.now();
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      Accept: check.accept,
      "User-Agent": "safe-inspector-production-acceptance",
    },
  });
  const latencyMs = Math.round(performance.now() - startedAt);

  assert.equal(
    response.status,
    200,
    `${check.path} returned HTTP ${response.status}.`,
  );
  assert.equal(
    response.headers.get("set-cookie"),
    null,
    `${check.path} unexpectedly created a browser profile.`,
  );
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  await check.validate(response);

  return { name: check.name, path: check.path, latencyMs };
}

const results = [];
for (const check of checks) {
  try {
    results.push(await runCheck(check));
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Production product acceptance failed.",
        name: check.name,
        path: check.path,
        detail: safeErrorMessage(error),
      }),
    );
    throw error;
  }
}

console.log(
  JSON.stringify(
    {
      target: requiredOrigin,
      mode: "GET-only product acceptance",
      requestCount: results.length,
      reference: {
        chainId: reference.chainId,
        safe: reference.safe,
        safeTxHash: reference.safeTxHash,
      },
      checks: results,
    },
    null,
    2,
  ),
);
