import type { Address, ChainId, SafeRef, SafeSnapshot } from "@/core/domain";
import type { PersistencePort, SafeDataPort } from "@/core/ports";

const MAX_DISCOVERED_SAFES = 100;

export interface DiscoveredSafeView {
  readonly chainId: ChainId;
  readonly address: Address;
  readonly imported: boolean;
}

export interface SafeDiscoveryResult {
  readonly items: readonly DiscoveredSafeView[];
  readonly total: number;
  readonly limited: boolean;
}

function key(safe: SafeRef): string {
  return `${safe.chainId}:${safe.address.toLowerCase()}`;
}

export async function resolveSafeDiscovery(
  safeData: Pick<SafeDataPort, "discoverSafesByOwner">,
  persistence: Pick<PersistencePort, "listSafesForProfile">,
  input: { readonly chainId: ChainId; readonly owner: Address },
  profileId: string | null,
): Promise<SafeDiscoveryResult> {
  const [discovered, imported] = await Promise.all([
    safeData.discoverSafesByOwner(input.chainId, input.owner),
    profileId
      ? persistence.listSafesForProfile(profileId)
      : Promise.resolve<readonly SafeSnapshot[]>([]),
  ]);
  const unique = new Map<string, SafeRef>();
  for (const safe of discovered) {
    if (safe.chainId !== input.chainId) continue;
    unique.set(key(safe), safe);
  }
  const all = [...unique.values()];
  const importedKeys = new Set(imported.map(key));
  const selected = all.slice(0, MAX_DISCOVERED_SAFES);

  return {
    items: selected.map((safe) => ({
      ...safe,
      imported: importedKeys.has(key(safe)),
    })),
    total: all.length,
    limited: all.length > selected.length,
  };
}
