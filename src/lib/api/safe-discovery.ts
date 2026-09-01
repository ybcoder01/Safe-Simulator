import { getAddress } from "viem";

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

export function parseBrowserWalletOwner(value: unknown): Address | null {
  if (!Array.isArray(value)) return null;
  const candidate = value[0];
  if (
    typeof candidate !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(candidate)
  ) {
    return null;
  }

  try {
    return getAddress(candidate) as Address;
  } catch {
    return null;
  }
}

export function parseBrowserWalletChainId(value: unknown): ChainId | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return null;
  }

  const chainId = Number.parseInt(value.slice(2), 16);
  return chainId === 1 || chainId === 50 ? chainId : null;
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
