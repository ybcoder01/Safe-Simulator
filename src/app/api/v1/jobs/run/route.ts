import { verifyQStashRequest } from "@/adapters/queue-qstash/queue";
import {
  getAbiPort,
  getCachePort,
  getChainPort,
  getPersistencePort,
  getQueuePort,
  getSafeDataPort,
  getSimulationPort,
} from "@/container";
import { enqueueSafeSync, runBackfillPage } from "@/core/ingestion/backfill";
import { runSyncSweep } from "@/core/ingestion/sweep";
import { runAnalyzeJob } from "@/lib/api/analysis-job";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/analysis-version";
import { queueJobSchema } from "@/lib/api/jobs";
import { runAnalyzeModuleJob } from "@/lib/api/module-analysis-job";
import { runReanalysisPage } from "@/lib/api/reanalysis-job";

export async function POST(request: Request) {
  const rawBody = await request.text();

  try {
    await verifyQStashRequest(request, rawBody);
  } catch {
    return Response.json(
      {
        error: {
          code: "invalid_job_signature",
          message: "Invalid job signature.",
        },
      },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return Response.json(
      { error: { code: "invalid_job", message: "Invalid job payload." } },
      { status: 400 },
    );
  }

  const parsed = queueJobSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "invalid_job", message: "Invalid job payload." } },
      { status: 400 },
    );
  }

  const job = parsed.data;
  const persistence = getPersistencePort();
  const queue = getQueuePort();
  const now = () => Math.floor(Date.now() / 1_000);

  switch (job.type) {
    case "backfill":
      return Response.json(
        await runBackfillPage(job, {
          persistence,
          queue,
          safeData: getSafeDataPort(),
          analysisEngineVersion: TRANSACTION_ANALYSIS_ENGINE_VERSION,
          now,
        }),
      );
    case "sync-sweep":
      return Response.json(
        await runSyncSweep(job, { persistence, queue, now }),
      );
    case "incremental-sync":
      await enqueueSafeSync(
        job.safe,
        queue,
        `incremental:${Math.floor(now() / 300)}`,
      );
      return Response.json({ scheduled: 4 });
    case "analyze":
      return Response.json(
        await runAnalyzeJob(job, {
          abi: getAbiPort(),
          cache: getCachePort(),
          chain: getChainPort(),
          persistence,
          safeData: getSafeDataPort(),
          simulation: getSimulationPort(),
          now,
        }),
      );
    case "analyze-module":
      return Response.json(
        await runAnalyzeModuleJob(job, {
          abi: getAbiPort(),
          chain: getChainPort(),
          persistence,
          safeData: getSafeDataPort(),
          simulation: getSimulationPort(),
          now,
        }),
      );
    case "reanalyze":
      return Response.json(
        await runReanalysisPage(job, { persistence, queue }),
      );
  }
}
