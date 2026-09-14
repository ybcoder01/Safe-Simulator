import type {
  ContractRegistryEntry,
  ContractRegistryTrustPolicy,
} from "@/core/analysis/trust/contract-registry";

export type ProtocolDirectoryFilter =
  | "all"
  | "whitelisted"
  | "identity-only"
  | "deprecated";

export type ProtocolDirectoryEntry = Pick<
  ContractRegistryEntry,
  | "address"
  | "label"
  | "lifecycle"
  | "logoKey"
  | "protocol"
  | "reference"
  | "role"
  | "trustPolicy"
>;

export interface ProtocolDirectoryGroup {
  readonly entries: readonly ProtocolDirectoryEntry[];
  readonly label: string;
  readonly protocol: string;
}

export const PROTOCOL_LABELS: Readonly<Record<string, string>> = {
  curve: "Curve",
  fathom: "Fathom",
  morpho: "Morpho",
  "oku-uniswap": "Oku Trade",
  reservoir: "Reservoir",
  silo: "Silo",
  stargate: "Stargate",
  xswap: "XSwap",
  yieldnest: "YieldNest",
};

export function filterProtocolDirectory(
  entries: readonly ProtocolDirectoryEntry[],
  query: string,
  filter: ProtocolDirectoryFilter,
): readonly ProtocolDirectoryGroup[] {
  const grouped = new Map<string, ProtocolDirectoryEntry[]>();
  for (const entry of entries) {
    grouped.set(entry.protocol, [
      ...(grouped.get(entry.protocol) ?? []),
      entry,
    ]);
  }

  const normalizedQuery = searchable(query).trim();

  return [...grouped.entries()].flatMap(([protocol, groupEntries]) => {
    const label = PROTOCOL_LABELS[protocol] ?? protocol;
    const protocolMatches = searchable(label, protocol).includes(
      normalizedQuery,
    );
    const visibleEntries = groupEntries.filter(
      (entry) =>
        matchesFilter(entry.trustPolicy, entry.lifecycle, filter) &&
        (protocolMatches ||
          searchable(
            entry.label,
            entry.role,
            entry.address,
            entry.lifecycle,
            entry.trustPolicy,
          ).includes(normalizedQuery)),
    );

    return visibleEntries.length > 0
      ? [{ entries: visibleEntries, label, protocol }]
      : [];
  });
}

function matchesFilter(
  trustPolicy: ContractRegistryTrustPolicy,
  lifecycle: ProtocolDirectoryEntry["lifecycle"],
  filter: ProtocolDirectoryFilter,
): boolean {
  if (filter === "whitelisted") {
    return trustPolicy === "protocol-whitelist" && lifecycle === "active";
  }
  if (filter === "identity-only") return trustPolicy === "identity-only";
  if (filter === "deprecated") return lifecycle === "deprecated";
  return true;
}

function searchable(...values: readonly string[]): string {
  return values.join(" ").toLowerCase().replaceAll(/[-_]/g, " ");
}
