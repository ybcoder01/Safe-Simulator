import type { Chain } from "viem";
import { mainnet, xdc } from "viem/chains";

import type { ChainId } from "@/core/domain";

export const supportedChains = [mainnet, xdc] as const;

const XDC_PUBLIC_RPC_URLS = [
  "https://rpc.xdcrpc.com",
  "https://rpc.xinfin.network",
  "https://erpc.xinfin.network",
] as const;
const XDC_PUBLIC_ARCHIVE_RPC_URLS = [
  "https://rpc.ankr.com/xdc",
  ...XDC_PUBLIC_RPC_URLS,
] as const;

const XDC_PUBLIC_TRACE_RPC_URL = "https://xdc-mainnet.gateway.tatum.io";

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
  const urls = configuredUrls(`RPC_URL_${chain.id}`);
  // viem's built-in XDC endpoint is deliberately not used: it returns 502s.
  const publicFallbacks =
    chain.id === xdc.id ? XDC_PUBLIC_RPC_URLS : chain.rpcUrls.default.http;

  return [...new Set([...urls, ...publicFallbacks])];
}

/**
 * Endpoints that answer debug_traceTransaction and debug_traceCall. Configured
 * providers are tried first; the keyless public XDC gateway only backs them up.
 */
export function getTraceRpcUrls(chainId: ChainId): readonly string[] {
  return [
    ...new Set([
      ...configuredUrls(`TRACE_RPC_URL_${chainId}`),
      ...(chainId === xdc.id ? [XDC_PUBLIC_TRACE_RPC_URL] : []),
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
