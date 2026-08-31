import { interpretStorageChanges } from "@/core/analysis/diffing/storage";
import type {
  Address,
  ChainId,
  ContractMetadata,
  StorageChange,
} from "@/core/domain";
import type { AbiPort } from "@/core/ports";
import type { ExecutionInsight } from "@/lib/api/execution-insight";

const MAX_STORAGE_METADATA_LOOKUPS = 20;

export interface StorageChangeAnalysis {
  readonly items: ReturnType<typeof interpretStorageChanges>;
  readonly namedCount: number;
  readonly rawCount: number;
  readonly contractCount: number;
  readonly verifiedLayoutCount: number;
  readonly lookupLimited: boolean;
  readonly warnings: readonly string[];
}

function uniqueAddresses(changes: readonly StorageChange[]): readonly Address[] {
  const addresses = new Map<string, Address>();
  for (const change of changes) {
    const key = change.address.toLowerCase();
    if (!addresses.has(key)) addresses.set(key, change.address);
  }
  return [...addresses.values()];
}

export async function resolveStorageChangeAnalysis(
  abi: Pick<AbiPort, "getContractMetadata">,
  chainId: ChainId,
  execution: Pick<ExecutionInsight, "storageChanges">,
): Promise<StorageChangeAnalysis> {
  const changes = execution.storageChanges.map((change) => ({
    ...change,
    address: change.address as Address,
  }));
  const addresses = uniqueAddresses(changes);
  const selected = addresses.slice(0, MAX_STORAGE_METADATA_LOOKUPS);
  const resolved = await Promise.all(
    selected.map((address) =>
      abi.getContractMetadata(chainId, address).catch(() => null),
    ),
  );
  const metadata = resolved.filter(
    (item): item is ContractMetadata => item !== null,
  );
  const items = interpretStorageChanges(changes, metadata);
  const namedCount = items.filter((item) => item.status === "named").length;
  const rawCount = items.length - namedCount;
  const lookupLimited = addresses.length > selected.length;
  const warnings: string[] = [];

  if (rawCount > 0) {
    warnings.push(
      "Unrecognized slots remain raw. Missing layout metadata or an unsafe-to-infer layout does not imply that the change is harmless.",
    );
  }
  if (lookupLimited) {
    warnings.push(
      `Verified layout lookup is limited to the first ${MAX_STORAGE_METADATA_LOOKUPS} changed contracts; later contracts remain raw.`,
    );
  }

  return {
    items,
    namedCount,
    rawCount,
    contractCount: addresses.length,
    verifiedLayoutCount: metadata.filter(
      (item) => item.verified && item.storageLayout,
    ).length,
    lookupLimited,
    warnings,
  };
}
