import { getQueuePort } from "@/container";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      {
        error: {
          code: "cron_not_configured",
          message: "CRON_SECRET is not configured.",
        },
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "unauthorized", message: "Unauthorized." } },
      { status: 401 },
    );
  }

  const bucket = Math.floor(Date.now() / 300_000);
  const result = await getQueuePort().enqueue(
    { type: "sync-sweep", cursor: null },
    { idempotencyKey: `cron-sweep:${bucket}` },
  );
  return Response.json({ queued: true, jobId: result.jobId });
}
