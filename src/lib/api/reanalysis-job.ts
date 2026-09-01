import type { QueueJob } from "@/core/domain";
import type { PersistencePort, QueuePort } from "@/core/ports";
import { TRANSACTION_ANALYSIS_ENGINE_VERSION } from "@/lib/api/transaction-analysis";

type ReanalysisJob = Extract<QueueJob, { readonly type: "reanalyze" }>;

export const REANALYSIS_PAGE_SIZE = 5;
export const REANALYSIS_ITEM_DELAY_SECONDS = 3;
export const REANALYSIS_NEXT_PAGE_DELAY_SECONDS =
  REANALYSIS_PAGE_SIZE * REANALYSIS_ITEM_DELAY_SECONDS + 5;

interface ReanalysisPorts {
  readonly persistence: Pick<PersistencePort, "listTransactions">;
  readonly queue: QueuePort;
}

export type ReanalysisPageResult =
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

function safeScope(job: ReanalysisJob) {
  return `${job.safe.chainId}:${job.safe.address.toLowerCase()}:${job.engineVersion}`;
}

export async function runReanalysisPage(
  job: ReanalysisJob,
  ports: ReanalysisPorts,
): Promise<ReanalysisPageResult> {
  if (job.engineVersion !== TRANSACTION_ANALYSIS_ENGINE_VERSION) {
    return { status: "skipped", reason: "unsupported_engine_version" };
  }

  const page = await ports.persistence.listTransactions(
    job.safe,
    job.cursor,
    REANALYSIS_PAGE_SIZE,
  );
  const scope = safeScope(job);

  await Promise.all(
    page.items.map((transaction, index) =>
      ports.queue.enqueue(
        {
          type: "analyze",
          safe: job.safe,
          safeTxHash: transaction.safeTxHash,
        },
        {
          idempotencyKey: `reanalyze:item:${scope}:${transaction.safeTxHash.toLowerCase()}`,
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
        idempotencyKey: `reanalyze:page:${scope}:${nextPage}`,
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
