import assert from "node:assert/strict";

const requiredOrigin = "https://safe-simulator.vercel.app";
const environment = process.env.SOAK_ENVIRONMENT;
const baseUrl = process.env.SOAK_BASE_URL;
const durationMinutes = Number(process.env.SOAK_DURATION_MINUTES ?? "15");
const allowedDurations = new Set([5, 15, 30]);
const intervalMs = 10_000;
const requestTimeoutMs = 10_000;
const maxTotalFailures = 5;
const maxFailuresPerEndpoint = 3;

assert.equal(
  environment,
  "production",
  "Refusing to run unless SOAK_ENVIRONMENT is exactly production.",
);
assert.ok(baseUrl, "SOAK_BASE_URL is required.");
assert.ok(
  allowedDurations.has(durationMinutes),
  "SOAK_DURATION_MINUTES must be 5, 15, or 30.",
);

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

const endpoints = [
  {
    path: "/",
    maxP95Ms: 4_000,
    async validate(response) {
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      const body = await response.text();
      assert.match(body, /Safe Inspector/);
      assert.match(body, /Understand every action/);
    },
  },
  {
    path: "/safes",
    maxP95Ms: 4_000,
    async validate(response) {
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      const body = await response.text();
      assert.match(body, /Safe accounts/);
      assert.match(body, /Read-only by design/);
    },
  },
  {
    path: "/api/health",
    maxP95Ms: 3_000,
    async validate(response) {
      assert.match(
        response.headers.get("content-type") ?? "",
        /application\/json/,
      );
      const body = await response.json();
      assert.equal(body.service, "safe-inspector");
      assert.equal(body.status, "ok");
      assert.equal(body.checks?.database, "ok");
      assert.equal(body.checks?.cache, "ok");
    },
  },
];

function percentile(values, fraction) {
  assert.ok(values.length > 0, "A percentile requires measurements.");
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function safeErrorMessage(error) {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

async function checkEndpoint(endpoint) {
  const url = new URL(endpoint.path, base);
  assert.equal(url.origin, requiredOrigin);
  assert.equal(url.pathname, endpoint.path);

  const startedAt = performance.now();
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      Accept:
        endpoint.path === "/api/health"
          ? "application/json"
          : "text/html,application/xhtml+xml",
    },
  });
  const latencyMs = Math.round(performance.now() - startedAt);

  assert.equal(
    response.status,
    200,
    `${endpoint.path} returned HTTP ${response.status}.`,
  );
  assert.equal(
    response.headers.get("set-cookie"),
    null,
    `${endpoint.path} unexpectedly created a browser profile.`,
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
  await endpoint.validate(response);

  return latencyMs;
}

const measurements = new Map(
  endpoints.map((endpoint) => [endpoint.path, []]),
);
const endpointFailures = new Map(
  endpoints.map((endpoint) => [endpoint.path, 0]),
);
const failures = [];
const startedAt = Date.now();
const deadline = startedAt + durationMinutes * 60_000;
const maximumRequests =
  (durationMinutes * 60_000 * endpoints.length) / intervalMs;
let completedCycles = 0;
let requestCount = 0;
let stoppedEarly = false;

while (Date.now() < deadline && requestCount < maximumRequests) {
  for (const endpoint of endpoints) {
    requestCount += 1;
    try {
      const latencyMs = await checkEndpoint(endpoint);
      measurements.get(endpoint.path).push(latencyMs);
    } catch (error) {
      const message = safeErrorMessage(error);
      const count = endpointFailures.get(endpoint.path) + 1;
      endpointFailures.set(endpoint.path, count);
      failures.push({ path: endpoint.path, message });
      console.error(
        JSON.stringify({
          level: "error",
          message: "Production read check failed.",
          path: endpoint.path,
          failureCount: count,
          detail: message,
        }),
      );

      if (
        failures.length >= maxTotalFailures ||
        count >= maxFailuresPerEndpoint
      ) {
        stoppedEarly = true;
        break;
      }
    }
  }

  completedCycles += 1;
  if (stoppedEarly) break;

  if (completedCycles % 6 === 0) {
    console.log(
      JSON.stringify({
        level: "info",
        message: "Production read soak is healthy.",
        completedCycles,
        requestCount,
      }),
    );
  }

  const remainingMs = deadline - Date.now();
  if (remainingMs > 0) {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(intervalMs, remainingMs)),
    );
  }
}

const endpointSummary = Object.fromEntries(
  endpoints.map((endpoint) => {
    const values = measurements.get(endpoint.path);
    return [
      endpoint.path,
      {
        successfulRequests: values.length,
        failures: endpointFailures.get(endpoint.path),
        p50Ms: values.length ? percentile(values, 0.5) : null,
        p95Ms: values.length ? percentile(values, 0.95) : null,
        maxMs: values.length ? Math.max(...values) : null,
        limitP95Ms: endpoint.maxP95Ms,
      },
    ];
  }),
);

const summary = {
  target: requiredOrigin,
  durationMinutes,
  elapsedSeconds: Math.round((Date.now() - startedAt) / 1_000),
  completedCycles,
  requestCount,
  maximumRequests,
  stoppedEarly,
  failures: failures.length,
  endpoints: endpointSummary,
};

console.log(JSON.stringify(summary, null, 2));

assert.equal(
  stoppedEarly,
  false,
  "The soak stopped early after repeated failures.",
);
assert.equal(failures.length, 0, "The soak observed failed requests.");
assert.ok(
  requestCount <= maximumRequests,
  "The hard request ceiling was exceeded.",
);

for (const endpoint of endpoints) {
  const values = measurements.get(endpoint.path);
  assert.ok(values.length > 0, `${endpoint.path} had no successful requests.`);
  assert.ok(
    percentile(values, 0.95) <= endpoint.maxP95Ms,
    `${endpoint.path} exceeded its p95 latency limit.`,
  );
}
