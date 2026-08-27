import { Client, Receiver } from "@upstash/qstash";

import type { QueueJob } from "@/core/domain";
import type { QueuePort } from "@/core/ports";

function isDevelopmentMode(environment: NodeJS.ProcessEnv = process.env) {
  return (
    environment.QSTASH_DEV === "true" &&
    environment.NODE_ENV !== "production"
  );
}

function createClient() {
  if (isDevelopmentMode())
    return new Client({ devMode: true, enableTelemetry: false });
  if (!process.env.QSTASH_TOKEN) {
    throw new Error(
      "QSTASH_TOKEN is not configured. Provision QStash and pull the Vercel environment variables.",
    );
  }
  return new Client({
    token: process.env.QSTASH_TOKEN,
    enableTelemetry: false,
  });
}

function createReceiver() {
  if (isDevelopmentMode()) return new Receiver({ devMode: true });
  if (
    !process.env.QSTASH_CURRENT_SIGNING_KEY ||
    !process.env.QSTASH_NEXT_SIGNING_KEY
  ) {
    throw new Error("QStash signing keys are not configured.");
  }
  return new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  });
}

export function applicationUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const explicitUrl = environment.APP_BASE_URL?.replace(/\/$/, "");
  if (explicitUrl) return explicitUrl;
  if (
    environment.VERCEL_ENV === "production" &&
    environment.VERCEL_PROJECT_PRODUCTION_URL
  ) {
    return `https://${environment.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, "")}`;
  }
  if (environment.VERCEL_URL) return `https://${environment.VERCEL_URL}`;
  if (isDevelopmentMode(environment)) return "http://localhost:3000";
  throw new Error(
    "APP_BASE_URL is not configured and VERCEL_URL is unavailable.",
  );
}

export async function toQStashDeduplicationId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

let client: Client | null = null;
let receiver: Receiver | null = null;

export class QStashQueueAdapter implements QueuePort {
  async enqueue(
    job: QueueJob,
    options: { idempotencyKey: string; delaySeconds?: number },
  ): Promise<{ jobId: string }> {
    client ??= createClient();
    const result = await client.publishJSON({
      url: `${applicationUrl()}/api/v1/jobs/run`,
      body: job,
      deduplicationId: await toQStashDeduplicationId(options.idempotencyKey),
      ...(options.delaySeconds === undefined
        ? {}
        : { delay: options.delaySeconds }),
      retries: 3,
      label: ["safe-inspector", job.type],
    });
    if (!("messageId" in result)) {
      throw new Error("QStash did not return a message identifier.");
    }
    return { jobId: result.messageId };
  }
}

export async function verifyQStashRequest(
  request: Request,
  rawBody: string,
): Promise<void> {
  receiver ??= createReceiver();
  const signature = request.headers.get("upstash-signature");
  if (!signature) throw new Error("Missing QStash signature.");

  const region = request.headers.get("upstash-region");
  await receiver.verify({
    signature,
    body: rawBody,
    url: request.url,
    ...(region ? { upstashRegion: region } : {}),
    clockTolerance: 5,
  });
}
