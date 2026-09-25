import type { SafeRef, SafeSnapshot } from "../domain";
import type { ChainPort, PersistencePort } from "../ports";

type SnapshotChain = Pick<ChainPort, "getSafeSnapshot">;
type SnapshotPersistence = Pick<PersistencePort, "upsertSafe">;

export interface SafeSnapshotRefreshPorts {
  readonly chain: SnapshotChain;
  readonly persistence: SnapshotPersistence;
}

export function assertValidSafeSnapshot(snapshot: SafeSnapshot): SafeSnapshot {
  if (
    snapshot.owners.length === 0 ||
    snapshot.threshold < 1 ||
    snapshot.threshold > snapshot.owners.length
  ) {
    throw new Error("The chain returned an invalid Safe configuration.");
  }

  return snapshot;
}

/**
 * Refreshes the canonical owner, threshold, nonce, guard, module, and
 * implementation snapshot before activity streams can be reported as synced.
 */
export async function refreshSafeSnapshot(
  safe: SafeRef,
  ports: SafeSnapshotRefreshPorts,
): Promise<SafeSnapshot> {
  const snapshot = assertValidSafeSnapshot(
    await ports.chain.getSafeSnapshot(safe),
  );
  await ports.persistence.upsertSafe(snapshot);
  return snapshot;
}
