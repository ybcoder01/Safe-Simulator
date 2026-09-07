import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

const baseUrl = process.env.SMOKE_BASE_URL;
const environment = process.env.SMOKE_ENVIRONMENT;
const oidcToken = process.env.VERCEL_TRUSTED_OIDC_TOKEN;
const navigationTimeoutMs = 30_000;
const defaultRenderTimeoutMs = 30_000;

assert.equal(
  environment,
  "preview",
  "Refusing to run unless SMOKE_ENVIRONMENT is exactly preview.",
);
assert.ok(baseUrl, "SMOKE_BASE_URL is required.");
assert.ok(oidcToken, "VERCEL_TRUSTED_OIDC_TOKEN is required.");

const base = new URL(baseUrl);
assert.equal(base.protocol, "https:", "Browser checks require HTTPS.");
assert.ok(
  base.hostname.endsWith(".vercel.app"),
  "Browser checks only accept a vercel.app deployment URL.",
);
assert.notEqual(
  base.hostname,
  "safe-simulator.vercel.app",
  "Refusing to run browser checks against the production domain.",
);

const xdcSafe = "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173";
const approvalSafe = "0x7ae1ef2979b0de85d7dea7f6a5582417d4a98c55";
const approvalHash =
  "0x0e47998fb92ce223105d15e36fa05aac47718baeaca8cc83a16be6e0815036cb";

const pages = [
  {
    name: "home",
    path: "/",
    expected: ["Safe Inspector", "Understand every action"],
  },
  {
    name: "watchlist",
    path: "/safes",
    expected: ["Safe accounts", "Read-only by design"],
  },
  {
    name: "safe-dashboard",
    path: `/safe/50/${xdcSafe}`,
    expected: [
      "XDC NETWORK",
      "Owners and controls",
      "Current balances",
      "Pending actions",
      "Transaction history",
      "Module executions",
      "Signed messages",
    ],
    timeoutMs: 45_000,
  },
  {
    name: "address-book",
    path: `/safe/50/${xdcSafe}/address-book`,
    expected: ["Address book", "Protocol addresses"],
    timeoutMs: 45_000,
  },
];

const forbiddenControl =
  /connect\s+(wallet|account)|sign\s+(transaction|message)|propose\s+transaction|execute\s+transaction|broadcast|relay/i;

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();

    socket.addEventListener("message", async (event) => {
      const raw =
        typeof event.data === "string"
          ? event.data
          : event.data instanceof Blob
            ? await event.data.text()
            : Buffer.from(event.data).toString("utf8");
      const message = JSON.parse(raw);

      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
        return;
      }

      for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(payload));
    });
  }

  waitFor(method, sessionId, timeoutMs = navigationTimeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.listeners.delete(listener);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);

      const listener = (message) => {
        if (message.method !== method || message.sessionId !== sessionId)
          return;
        clearTimeout(timeout);
        this.listeners.delete(listener);
        resolve(message.params);
      };
      this.listeners.add(listener);
    });
  }

  listen(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Timed out connecting to Chromium.")),
      navigationTimeoutMs,
    );
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
        reject(new Error("Chromium DevTools connection failed."));
      },
      { once: true },
    );
  });
  return new CdpConnection(socket);
}

async function waitForText(during, timeoutMs, failureMessage) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = "";

  while (Date.now() < deadline) {
    lastValue = await during();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  assert.fail(
    `${failureMessage} Last value: ${String(lastValue).slice(0, 500)}`,
  );
}

async function requestJson(pathname) {
  const url = new URL(pathname, base);
  assert.equal(url.origin, base.origin);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-vercel-trusted-oidc-idp-token": oidcToken,
    },
    redirect: "error",
    signal: AbortSignal.timeout(navigationTimeoutMs),
  });
  assert.equal(
    response.status,
    200,
    `${pathname} returned HTTP ${response.status}.`,
  );
  assert.equal(new URL(response.url).origin, base.origin);
  assert.match(
    response.headers.get("content-type") ?? "",
    /application[/]json/,
  );
  return response.json();
}

const approvalResponse = await requestJson(
  `/api/v1/safes/50/${approvalSafe}/tx/${approvalHash}`,
);
const approval = approvalResponse.data;
assert.equal(approval.status, "executed");
assert.equal(approval.verdict?.verdict, "unverified");
assert.ok(approval.approvalRisk?.requests?.length > 0);
assert.ok(approval.approvalRisk?.executedChanges?.length > 0);
assert.equal(approval.approvalRisk.requests[0]?.standard, "erc20");
assert.equal(approval.approvalRisk.requests[0]?.infinite, false);
assert.match(
  approval.approvalRisk.requests[0]?.spender ?? "",
  /^0x[0-9a-f]{40}$/i,
);

const profileDirectory = await mkdtemp(
  join(tmpdir(), "safe-inspector-preview-browser-"),
);
const chromePath = process.env.CHROME_PATH || "google-chrome";
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

let browserSocketUrl;
try {
  browserSocketUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Chromium did not publish a DevTools endpoint."));
    }, navigationTimeoutMs);
    const lines = createInterface({ input: chrome.stderr });

    lines.on("line", (line) => {
      const match = line.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!match) return;
      clearTimeout(timeout);
      lines.close();
      resolve(match[1]);
    });
    chrome.once("error", reject);
    chrome.once("exit", (code) => {
      reject(new Error(`Chromium exited before startup with code ${code}.`));
    });
  });

  const cdp = await connect(browserSocketUrl);
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  const sessionId = attached.sessionId;

  await Promise.all([
    cdp.send("Page.enable", {}, sessionId),
    cdp.send("Runtime.enable", {}, sessionId),
    cdp.send("Network.enable", {}, sessionId),
  ]);
  await cdp.send(
    "Network.setExtraHTTPHeaders",
    {
      headers: {
        "x-vercel-trusted-oidc-idp-token": oidcToken,
      },
    },
    sessionId,
  );

  let pageFailures = [];
  const stopListening = cdp.listen((message) => {
    if (message.sessionId !== sessionId) return;

    if (
      message.method === "Runtime.consoleAPICalled" &&
      message.params.type === "error"
    ) {
      pageFailures.push("console.error");
    }
    if (message.method === "Runtime.exceptionThrown") {
      pageFailures.push(
        message.params.exceptionDetails?.text ?? "Uncaught page exception",
      );
    }
    if (
      message.method === "Network.responseReceived" &&
      message.params.type === "Document" &&
      message.params.response.status >= 400
    ) {
      pageFailures.push(
        `Document returned HTTP ${message.params.response.status}`,
      );
    }
  });

  const evaluate = async (expression) => {
    const result = await cdp.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text ?? "Evaluation failed.");
    }
    return result.result?.value;
  };

  for (const page of pages) {
    pageFailures = [];
    const url = new URL(page.path, base);
    assert.equal(url.origin, base.origin);

    const loaded = cdp.waitFor("Page.loadEventFired", sessionId);
    const navigation = await cdp.send(
      "Page.navigate",
      { url: url.href },
      sessionId,
    );
    assert.equal(
      navigation.errorText,
      undefined,
      `${page.name} navigation failed: ${navigation.errorText}`,
    );
    await loaded;

    const bodyText = await waitForText(
      async () => {
        const value = await evaluate("document.body?.innerText || ''");
        return page.expected.every((text) => value.includes(text)) ? value : "";
      },
      page.timeoutMs ?? defaultRenderTimeoutMs,
      `${page.name} did not render its acceptance text.`,
    );

    const location = await evaluate("location.href");
    assert.equal(new URL(location).origin, base.origin);
    assert.match(await evaluate("document.title"), /Safe Inspector/);

    const controlText = await evaluate(`
      Array.from(document.querySelectorAll("button, a, input, select, textarea"))
        .map((element) =>
          [
            element.innerText,
            element.getAttribute("aria-label"),
            element.getAttribute("title"),
            element.getAttribute("name"),
          ].filter(Boolean).join(" ")
        )
        .join("\\n")
    `);
    assert.doesNotMatch(
      controlText,
      forbiddenControl,
      `${page.name} exposed a forbidden interactive control.`,
    );
    assert.doesNotMatch(
      bodyText,
      /wallet connection required|connect a wallet to continue/i,
      `${page.name} introduced a wallet dependency.`,
    );

    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepEqual(
      pageFailures,
      [],
      `${page.name} emitted browser failures: ${pageFailures.join(" | ")}`,
    );
  }

  stopListening();
  cdp.socket.close();

  console.log(
    JSON.stringify({
      deployment: base.origin,
      checks: pages.map((page) => page.name),
      browser: "chromium",
      consoleErrors: 0,
      pageExceptions: 0,
      forbiddenControls: 0,
      status: "ok",
    }),
  );
} finally {
  if (chrome.exitCode === null) {
    chrome.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  if (chrome.exitCode === null) {
    chrome.kill("SIGKILL");
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  await rm(profileDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200,
  });
}
