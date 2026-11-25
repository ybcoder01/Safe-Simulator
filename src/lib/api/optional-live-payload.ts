import type {
  Confirmation,
  Hex,
  SafeExecutionPayload,
  SafeRef,
} from "@/core/domain";
import type { SafeDataPort } from "@/core/ports";

export const OPTIONAL_LIVE_PAYLOAD_TIMEOUT_MS = 1_500;

/**
 * Combines stored and live confirmation snapshots without letting an older
 * service response make the report appear to lose a signature. A live
 * confirmation replaces the stored value for the same owner.
 */
export function mergeConfirmationSnapshots(
  stored: readonly Confirmation[],
  live: readonly Confirmation[] | null | undefined,
): readonly Confirmation[] {
  const confirmations = new Map(
    stored.map((confirmation) => [
      confirmation.owner.toLowerCase(),
      confirmation,
    ]),
  );

  for (const confirmation of live ?? []) {
    confirmations.set(confirmation.owner.toLowerCase(), confirmation);
  }

  return [...confirmations.values()].sort((left, right) =>
    left.owner.toLowerCase().localeCompare(right.owner.toLowerCase()),
  );
}

export async function resolveOptionalLivePayload(
  safeData: Pick<SafeDataPort, "getMultisigTransaction">,
  safe: SafeRef,
  safeTxHash: Hex,
  timeoutMs = OPTIONAL_LIVE_PAYLOAD_TIMEOUT_MS,
): Promise<SafeExecutionPayload | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      safeData.getMultisigTransaction(safe, safeTxHash).catch(() => null),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
