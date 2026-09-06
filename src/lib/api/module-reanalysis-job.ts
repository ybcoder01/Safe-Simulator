import type { QueueJob } from "@/core/domain";
import type { PersistencePort, QueuePort } from "@/core/ports";
import { MODULE_ANALYSIS_ENGINE_VERSION } from "@/lib/api/module-analysis";
import {
  REANALYSIS_ITEM_DELAY_SECONDS,
  REANALYSIS_NEXT_PAGE_DELAY_SECONDS,
  REANALYSIS_PAGE_SIZE,
} from "@/lib/api/reanalysis-job";

type ModuleReanalysisJob = Extract<
  QueueJob,
  { readonly type: "reanalyze-module" }
>;

interface ModuleReanalysisPorts {
  readonly persistence: Pick<PersistencePort, "listModuleTransactions">;
  readonly queue: QueuePort;
}

export type ModuleReanalysisPageResult =
  | {
      readonly status: "skipped";
      readonly reason: "unsupported_engine_version";
    }
  | {
      readonly status: "complete";
      readonly scanned: number;
      readonly scheduled: number;
      readonly nextPage: number | null;
    };

function safeScope(job: ModuleReanalysisJob) {
  return [
    job.safe.chainId,
    job.safe.address.toLowerCase(),
    job.engineVersion,
    job.runId,
  ].join(":");
}

export async function runModuleReanalysisPage(
  job: ModuleReanalysisJob,
  ports: ModuleReanalysisPorts,
): Promise<ModuleReanalysisPageResult> {
  if (job.engineVersion !== MODULE_ANALYSIS_ENGINE_VERSION) {
    return { status: "skipped", reason: "unsupported_engine_version" };
  }

  const page = await ports.persistence.listModuleTransactions(
    job.safe,
    job.cursor,
    REANALYSIS_PAGE_SIZE,
  );
  const scope = safeScope(job);

  await Promise.all(
    page.items.map((transaction, index) =>
      ports.queue.enqueue(
        {
          type: "analyze-module",
          safe: job.safe,
          transactionHash: transaction.transactionHash,
        },
        {
          idempotencyKey: `reanalyze-module:item:${scope}:${transaction.transactionHash.toLowerCase()}`,
          delaySeconds: index * REANALYSIS_ITEM_DELAY_SECONDS,
        },
      ),
    ),
  );

  if (page.nextCursor) {
    const nextPage = job.page + 1;
    await ports.queue.enqueue(
      {
        ...job,
        cursor: page.nextCursor,
        page: nextPage,
      },
      {
        idempotencyKey: `reanalyze-module:page:${scope}:${nextPage}`,
        delaySeconds: REANALYSIS_NEXT_PAGE_DELAY_SECONDS,
      },
    );
    return {
      status: "complete",
      scanned: page.items.length,
      scheduled: page.items.length,
      nextPage,
    };
  }

  return {
    status: "complete",
    scanned: page.items.length,
    scheduled: page.items.length,
    nextPage: null,
  };
}
