import type { QueueJob } from "../domain";
import type { PersistencePort, QueuePort } from "../ports";
import { enqueueSafeSync } from "./backfill";

type SweepJob = Extract<QueueJob, { type: "sync-sweep" }>;
type SweepPersistence = Pick<PersistencePort, "listSafes">;

const SWEEP_PAGE_SIZE = 100;

export async function runSyncSweep(
  job: SweepJob,
  ports: { persistence: SweepPersistence; queue: QueuePort; now: () => number },
) {
  const page = await ports.persistence.listSafes(job.cursor, SWEEP_PAGE_SIZE);
  const bucket = Math.floor(ports.now() / 300);

  await Promise.all(
    page.items.map((safe) =>
      enqueueSafeSync(safe, ports.queue, `scheduled:${bucket}`),
    ),
  );

  if (page.nextCursor) {
    await ports.queue.enqueue(
      { type: "sync-sweep", cursor: page.nextCursor },
      {
        idempotencyKey: `sweep:${bucket}:${page.nextCursor}`,
      },
    );
  }

  return { scheduled: page.items.length, nextCursor: page.nextCursor };
}
