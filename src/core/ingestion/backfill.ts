import type { Page, QueueJob, SafeRef, SyncCursor } from "../domain";
import type { PersistencePort, QueuePort, SafeDataPort } from "../ports";

type BackfillJob = Extract<QueueJob, { type: "backfill" }>;
type IngestionPersistence = Pick<
  PersistencePort,
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
  readonly now: () => number;
}

const PAGE_SIZE = 100;

async function readAndPersistPage(
  job: BackfillJob,
  cursor: string | null,
  ports: BackfillPorts,
): Promise<Page<unknown>> {
  switch (job.stream) {
    case "multisig": {
      const page = await ports.safeData.listMultisigTransactions(
        job.safe,
        cursor,
        PAGE_SIZE,
      );
      await ports.persistence.upsertTransactions(page.items);
      return page;
    }
    case "module": {
      const page = await ports.safeData.listModuleTransactions(
        job.safe,
        cursor,
        PAGE_SIZE,
      );
      await ports.persistence.upsertModuleTransactions(page.items);
      return page;
    }
    case "transfer": {
      const page = await ports.safeData.listTransfers(
        job.safe,
        cursor,
        PAGE_SIZE,
      );
      await ports.persistence.upsertTransfers(page.items);
      return page;
    }
    case "message": {
      const page = await ports.safeData.listMessages(
        job.safe,
        cursor,
        PAGE_SIZE,
      );
      await ports.persistence.upsertMessages(page.items);
      return page;
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
    const page = await readAndPersistPage(job, cursor, ports);
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
