import type {
  Address,
  ContractMetadata,
  Hex,
  StorageChange,
} from "../../domain";

export interface InterpretedStorageChange extends StorageChange {
  readonly status: "named" | "raw";
  readonly label: string | null;
  readonly type: string | null;
  readonly contractLabel: string | null;
  readonly metadataSource: ContractMetadata["source"] | null;
}

function key(value: string): string {
  return value.toLowerCase();
}

export function interpretStorageChanges(
  changes: readonly StorageChange[],
  metadata: readonly ContractMetadata[],
): readonly InterpretedStorageChange[] {
  const layouts = new Map(
    metadata
      .filter((item) => item.verified && item.storageLayout)
      .map((item) => [key(item.address), item] as const),
  );

  return changes.map((change) => {
    const contract = layouts.get(key(change.address));
    const matches =
      contract?.storageLayout?.slots.filter(
        (entry) => key(entry.slot) === key(change.slot),
      ) ?? [];
    const exact =
      matches.length === 1 &&
      matches[0]?.offset === 0 &&
      matches[0]?.numberOfBytes === 32 &&
      matches[0]?.encoding === "inplace"
        ? matches[0]
        : null;

    return {
      ...change,
      status: exact ? "named" : "raw",
      label: exact?.label ?? null,
      type: exact?.type ?? null,
      contractLabel: exact ? contract?.label ?? null : null,
      metadataSource: exact ? contract?.source ?? null : null,
    };
  });
}
