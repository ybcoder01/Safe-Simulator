import { Client, Receiver } from "@upstash/qstash";

import type { QueueJob } from "@/core/domain";
import type { QueuePort } from "@/core/ports";

function isDevelopmentMode() {
  return (
    process.env.QSTASH_DEV === "true" && process.env.NODE_ENV !== "production"
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

function applicationUrl() {
  const explicitUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
  if (explicitUrl) return explicitUrl;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (isDevelopmentMode()) return "http://localhost:3000";
  throw new Error(
    "APP_BASE_URL is not configured and VERCEL_URL is unavailable.",
  );
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
      deduplicationId: options.idempotencyKey,
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
