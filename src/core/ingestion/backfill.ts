import type {
  ModuleTransaction,
  Page,
  QueueJob,
  SafeRef,
  SafeTransaction,
  SyncCursor,
} from "../domain";
import type { PersistencePort, QueuePort, SafeDataPort } from "../ports";

type BackfillJob = Extract<QueueJob, { type: "backfill" }>;
type IngestionPersistence = Pick<
  PersistencePort,
  | "findAnalyses"
  | "findModuleAnalyses"
  | "findSyncCursor"
  | "saveSyncCursor"
  | "upsertMessages"
  | "upsertModuleTransactions"
  | "upsertTransactions"
  | "upsertTransfers"
>;

export interface BackfillPorts {
  readonly safeData: SafeDataPort;
  readonly persistence: IngestionPersistence;
  readonly queue: QueuePort;
  readonly analysisEngineVersion: string;
  readonly moduleAnalysisEngineVersion: string;
  readonly now: () => number;
}

const PAGE_SIZE = 100;
export const AUTO_ANALYSIS_LIMIT = 5;
export const AUTO_ANALYSIS_DELAY_SECONDS = 3;
const AUTO_ANALYSIS_RETRY_WINDOW_SECONDS = 15 * 60;

interface PersistedPage {
  readonly page: Page<unknown>;
  readonly scheduledAnalyses: number;
}

async function enqueueMissingFirstPageAnalyses(
  job: BackfillJob,
  cursor: string | null,
  items: readonly SafeTransaction[],
  ports: BackfillPorts,
): Promise<number> {
  if (cursor !== null || items.length === 0) return 0;

  const hashes = items.map((transaction) => transaction.safeTxHash);
  const analyses = await ports.persistence.findAnalyses(
    job.safe,
    hashes,
    ports.analysisEngineVersion,
  );
  const analyzedHashes = new Set(
    analyses.map((analysis) => analysis.safeTxHash.toLowerCase()),
  );
  const missing = items
    .filter(
      (transaction) =>
        !analyzedHashes.has(transaction.safeTxHash.toLowerCase()),
    )
    .slice(0, AUTO_ANALYSIS_LIMIT);
  const retryBucket = Math.floor(
    ports.now() / AUTO_ANALYSIS_RETRY_WINDOW_SECONDS,
  );

  await Promise.all(
    missing.map((transaction, index) =>
      ports.queue.enqueue(
        {
          type: "analyze",
          safe: job.safe,
          safeTxHash: transaction.safeTxHash,
        },
        {
          idempotencyKey: [
            "auto-analyze",
            job.safe.chainId,
            job.safe.address.toLowerCase(),
            ports.analysisEngineVersion,
            transaction.safeTxHash.toLowerCase(),
            retryBucket,
          ].join(":"),
          delaySeconds: index * AUTO_ANALYSIS_DELAY_SECONDS,
        },
      ),
    ),
  );

  return missing.length;
}

async function enqueueMissingFirstPageModuleAnalyses(
  job: BackfillJob,
  cursor: string | null,
  items: readonly ModuleTransaction[],
  ports: BackfillPorts,
): Promise<number> {
  if (cursor !== null || items.length === 0) return 0;

  const hashes = items.map((transaction) => transaction.transactionHash);
  const analyses = await ports.persistence.findModuleAnalyses(
    job.safe,
    hashes,
    ports.moduleAnalysisEngineVersion,
  );
  const analyzedHashes = new Set(
    analyses.map((analysis) => analysis.transactionHash.toLowerCase()),
  );
  const missing = items
    .filter(
      (transaction) =>
        !analyzedHashes.has(transaction.transactionHash.toLowerCase()),
    )
    .slice(0, AUTO_ANALYSIS_LIMIT);
  const retryBucket = Math.floor(
    ports.now() / AUTO_ANALYSIS_RETRY_WINDOW_SECONDS,
  );

  await Promise.all(
    missing.map((transaction, index) =>
      ports.queue.enqueue(
        {
          type: "analyze-module",
          safe: job.safe,
          transactionHash: transaction.transactionHash,
        },
        {
          idempotencyKey: [
            "auto-analyze-module",
            job.safe.chainId,
            job.safe.address.toLowerCase(),
            ports.moduleAnalysisEngineVersion,
            transaction.transactionHash.toLowerCase(),
            retryBucket,
          ].join(":"),
          delaySeconds: index * AUTO_ANALYSIS_DELAY_SECONDS,
        },
      ),
    ),
  );

  return missing.length;
}

async function readAndPersistPage(
  job: BackfillJob,
  cursor: string | null,
  ports: BackfillPorts,
): Promise<PersistedPage> {
  switch (job.stream) {
    case "multisig": {
      const page = await ports.safeData.listMultisigTransactions(
        job.safe,
        cursor,
        PAGE_SIZE,
      );
      await ports.persistence.upsertTransactions(page.items);
      const scheduledAnalyses = await enqueueMissingFirstPageAnalyses(
        job,
        cursor,
        page.items,
        ports,
      );
      return { page, scheduledAnalyses };
    }
    case "module": {
      const page = await ports.safeData.listModuleTransactions(
        job.safe,
        cursor,
        PAGE_SIZE,
      );
      await ports.persistence.upsertModuleTransactions(page.items);
      const scheduledAnalyses = await enqueueMissingFirstPageModuleAnalyses(
        job,
        cursor,
        page.items,
        ports,
      );
      return { page, scheduledAnalyses };
    }
    case "transfer": {
      const page = await ports.safeData.listTransfers(
        job.safe,
        cursor,
        PAGE_SIZE,
      );
      await ports.persistence.upsertTransfers(page.items);
      return { page, scheduledAnalyses: 0 };
    }
    case "message": {
      const page = await ports.safeData.listMessages(
        job.safe,
        cursor,
        PAGE_SIZE,
      );
      await ports.persistence.upsertMessages(page.items);
      return { page, scheduledAnalyses: 0 };
    }
  }
}

function cursorState(
  job: BackfillJob,
  cursor: string | null,
  status: SyncCursor["status"],
  now: number,
): SyncCursor {
  return { safe: job.safe, stream: job.stream, cursor, status, updatedAt: now };
}

export async function runBackfillPage(job: BackfillJob, ports: BackfillPorts) {
  const stored = await ports.persistence.findSyncCursor(job.safe, job.stream);
  const cursor = stored?.cursor ?? null;
  await ports.persistence.saveSyncCursor(
    cursorState(job, cursor, "running", ports.now()),
  );

  try {
    const { page, scheduledAnalyses } = await readAndPersistPage(
      job,
      cursor,
      ports,
    );
    const status = page.nextCursor ? "running" : "complete";
    await ports.persistence.saveSyncCursor(
      cursorState(job, page.nextCursor, status, ports.now()),
    );

    if (page.nextCursor) {
      await ports.queue.enqueue(job, {
        idempotencyKey: `backfill:${job.safe.chainId}:${job.safe.address}:${job.stream}:${page.nextCursor}`,
      });
    }

    return {
      processed: page.items.length,
      scheduledAnalyses,
      nextCursor: page.nextCursor,
      status,
    };
  } catch (error) {
    await ports.persistence.saveSyncCursor(
      cursorState(job, cursor, "failed", ports.now()),
    );
    throw error;
  }
}

export async function enqueueSafeSync(
  safe: SafeRef,
  queue: QueuePort,
  idempotencyScope: string,
) {
  const streams: readonly SyncCursor["stream"][] = [
    "multisig",
    "module",
    "transfer",
    "message",
  ];
  await Promise.all(
    streams.map((stream) =>
      queue.enqueue(
        { type: "backfill", safe, stream },
        {
          idempotencyKey: `sync:${idempotencyScope}:${safe.chainId}:${safe.address}:${stream}`,
        },
      ),
    ),
  );
}
