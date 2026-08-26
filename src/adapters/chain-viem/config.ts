import type { Chain } from "viem";
import { mainnet, xdc } from "viem/chains";

import type { ChainId } from "@/core/domain";

export const supportedChains = [mainnet, xdc] as const;

export function getSupportedChain(chainId: ChainId): Chain {
  const chain = supportedChains.find((candidate) => candidate.id === chainId);
  if (!chain) throw new Error(`Unsupported chain ${chainId}.`);
  return chain;
}

export function getRpcUrls(chain: Chain): readonly string[] {
  const configured = process.env[`RPC_URL_${chain.id}`]
    ?.split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  return configured && configured.length > 0
    ? configured
    : chain.rpcUrls.default.http;
}

export const supportedChainSummaries = supportedChains.map((chain) => ({
  id: chain.id,
  name: chain.name,
}));
