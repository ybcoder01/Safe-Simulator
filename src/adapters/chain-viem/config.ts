import type { Chain } from "viem";
import { mainnet, xdc } from "viem/chains";

import type { ChainId } from "@/core/domain";

export const supportedChains = [mainnet, xdc] as const;

const XDC_PUBLIC_ARCHIVE_RPC_URLS = ["https://rpc.ankr.com/xdc"] as const;

function configuredUrls(key: string): readonly string[] {
  return (process.env[key] ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export function getSupportedChain(chainId: ChainId): Chain {
  const chain = supportedChains.find((candidate) => candidate.id === chainId);
  if (!chain) throw new Error(`Unsupported chain ${chainId}.`);
  return chain;
}

export function getRpcUrls(chain: Chain): readonly string[] {
  return [
    ...new Set([
      ...configuredUrls(`RPC_URL_${chain.id}`),
      ...chain.rpcUrls.default.http,
    ]),
  ];
}

export function getArchiveRpcUrls(chain: Chain): readonly string[] {
  const publicFallbacks =
    chain.id === xdc.id ? XDC_PUBLIC_ARCHIVE_RPC_URLS : [];

  return [
    ...new Set([
      ...configuredUrls(`ARCHIVE_RPC_URL_${chain.id}`),
      ...publicFallbacks,
      ...getRpcUrls(chain),
    ]),
  ];
}

export const supportedChainSummaries = supportedChains.map((chain) => ({
  id: chain.id,
  name: chain.name,
}));
