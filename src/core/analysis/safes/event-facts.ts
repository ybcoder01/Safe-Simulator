import type { Address, Hex, LogEntry } from "../../domain";

export const SAFE_ADDED_OWNER_TOPIC =
  "0x9465fa0c962cc76958e6373a993326400c1c94f8be2fe3a952adfa7f60b2ea26" as Hex;
export const SAFE_REMOVED_OWNER_TOPIC =
  "0xf8d49fc529812e9a7c5c50e69c20f0dccc0db8fa95c98bc58cc9a4f1c1299eaf" as Hex;
export const SAFE_CHANGED_THRESHOLD_TOPIC =
  "0x610f7ff2b304ae8903c3de74c60c6ab1f7d6226b3f52c5161905bb5ad4039c93" as Hex;
export const SAFE_ENABLED_MODULE_TOPIC =
  "0xecdf3a3effea5783a3c4c2140e677577666428d44ed9d474a0b3a4c9943f8440" as Hex;
export const SAFE_DISABLED_MODULE_TOPIC =
  "0xaab4fa2b463f581b2b32cb3b7e3b704b9ce37cc209b5fb4d77e593ace4054276" as Hex;
export const SAFE_CHANGED_GUARD_TOPIC =
  "0x1151116914515bc0891ff9047a6cb32cf902546f83066499bcf8ba33d2353fa2" as Hex;
export const SAFE_CHANGED_FALLBACK_HANDLER_TOPIC =
  "0x5ac6c46c93c8d0e53714ba3b53db3e7c046da994313d7ed0d192028bc7c228b0" as Hex;
export const SAFE_CHANGED_IMPLEMENTATION_TOPIC =
  "0x75e41bc35ff1bf14d81d1d2f649c0084a0f974f9289c803ec9898eeec4c8d0b8" as Hex;

const WORD_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const PADDED_ADDRESS_PATTERN = /^0x0{24}[0-9a-fA-F]{40}$/;

export type SafeConfigurationField =
  | "owner"
  | "threshold"
  | "module"
  | "guard"
  | "fallback-handler"
  | "implementation";

export interface SafeConfigurationChange {
  readonly field: SafeConfigurationField;
  readonly action: "added" | "removed" | "changed";
  readonly before: string | null;
  readonly after: string | null;
  readonly logIndex: number;
  readonly provenance: "safe-event";
}

function eventWord(log: LogEntry): Hex | null {
  if (log.topics.length === 1 && WORD_PATTERN.test(log.data)) {
    return log.data;
  }
  if (
    log.topics.length === 2 &&
    WORD_PATTERN.test(log.topics[1] ?? "") &&
    log.data === "0x"
  ) {
    return log.topics[1] ?? null;
  }
  return null;
}

function wordAddress(word: Hex): Address | null {
  if (!PADDED_ADDRESS_PATTERN.test(word)) return null;
  return `0x${word.slice(-40).toLowerCase()}` as Address;
}

function wordNumber(word: Hex): string | null {
  try {
    return BigInt(word).toString();
  } catch {
    return null;
  }
}

/**
 * Extracts transaction-specific Safe configuration changes from canonical
 * Safe events emitted by the Safe itself. Event values are reported exactly;
 * prior values stay unknown when the event does not carry them.
 */
export function extractSafeConfigurationChanges(
  logs: readonly LogEntry[],
  safe: Address,
): readonly SafeConfigurationChange[] {
  const changes: SafeConfigurationChange[] = [];
  const normalizedSafe = safe.toLowerCase();

  for (const log of logs) {
    if (log.address.toLowerCase() !== normalizedSafe) continue;

    const signature = log.topics[0]?.toLowerCase();
    const word = eventWord(log);
    if (!signature || !word) continue;

    const address = wordAddress(word);
    const common = {
      logIndex: log.logIndex,
      provenance: "safe-event" as const,
    };

    if (signature === SAFE_ADDED_OWNER_TOPIC && address) {
      changes.push({
        field: "owner",
        action: "added",
        before: null,
        after: address,
        ...common,
      });
    } else if (signature === SAFE_REMOVED_OWNER_TOPIC && address) {
      changes.push({
        field: "owner",
        action: "removed",
        before: address,
        after: null,
        ...common,
      });
    } else if (signature === SAFE_CHANGED_THRESHOLD_TOPIC) {
      const threshold = wordNumber(word);
      if (threshold !== null) {
        changes.push({
          field: "threshold",
          action: "changed",
          before: null,
          after: threshold,
          ...common,
        });
      }
    } else if (signature === SAFE_ENABLED_MODULE_TOPIC && address) {
      changes.push({
        field: "module",
        action: "added",
        before: null,
        after: address,
        ...common,
      });
    } else if (signature === SAFE_DISABLED_MODULE_TOPIC && address) {
      changes.push({
        field: "module",
        action: "removed",
        before: address,
        after: null,
        ...common,
      });
    } else if (signature === SAFE_CHANGED_GUARD_TOPIC && address) {
      changes.push({
        field: "guard",
        action: "changed",
        before: null,
        after: address,
        ...common,
      });
    } else if (
      signature === SAFE_CHANGED_FALLBACK_HANDLER_TOPIC &&
      address
    ) {
      changes.push({
        field: "fallback-handler",
        action: "changed",
        before: null,
        after: address,
        ...common,
      });
    } else if (
      signature === SAFE_CHANGED_IMPLEMENTATION_TOPIC &&
      address
    ) {
      changes.push({
        field: "implementation",
        action: "changed",
        before: null,
        after: address,
        ...common,
      });
    }
  }

  return changes;
}
