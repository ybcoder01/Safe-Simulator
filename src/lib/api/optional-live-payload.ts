import type { Hex, SafeExecutionPayload, SafeRef } from "@/core/domain";
import type { SafeDataPort } from "@/core/ports";

export const OPTIONAL_LIVE_PAYLOAD_TIMEOUT_MS = 1_500;

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
