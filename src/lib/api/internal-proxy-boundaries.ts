import type { Address, ChainId } from "@/core/domain";
import type { AbiPort } from "@/core/ports";
import type { ExecutionInsight } from "@/lib/api/execution-insight";

const MAX_INTERNAL_PROXY_SOURCES = 8;

export interface InternalProxyBoundary {
  readonly proxy: Address;
  readonly implementation: Address;
}

function addressKey(address: string): string {
  return address.toLowerCase();
}

/**
 * Resolves only traced, direct proxy-to-implementation pairs. Lookups are
 * deduplicated and bounded; unavailable evidence fails closed.
 */
export async function resolveInternalProxyBoundaries(
  abi: AbiPort,
  chainId: ChainId,
  internalCalls: ExecutionInsight["internalCalls"],
  excludedCallers: readonly Address[],
  blockNumber?: bigint,
): Promise<readonly InternalProxyBoundary[]> {
  const excluded = new Set(excludedCallers.map(addressKey));
  const seen = new Set<string>();
  const sources = internalCalls
    .filter((call) => call.operation === "delegatecall")
    .map((call) => call.from as Address)
    .filter((address) => {
      const key = addressKey(address);
      if (excluded.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_INTERNAL_PROXY_SOURCES);

  const resolved = await Promise.all(
    sources.map(async (proxy) => {
      try {
        const chain = await abi.resolveImplementationChain(
          chainId,
          proxy,
          blockNumber,
        );
        const implementation = chain[0];
        if (!implementation) return null;

        const observed = internalCalls.some(
          (call) =>
            call.operation === "delegatecall" &&
            addressKey(call.from) === addressKey(proxy) &&
            addressKey(call.to) === addressKey(implementation),
        );
        return observed ? { proxy, implementation } : null;
      } catch {
        return null;
      }
    }),
  );

  return resolved.filter(
    (boundary): boundary is InternalProxyBoundary => boundary !== null,
  );
}
