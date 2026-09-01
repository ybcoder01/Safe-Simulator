import { PublicAbiAdapter } from "@/adapters/abi-sourcify/metadata";
import { UpstashCacheAdapter } from "@/adapters/cache-upstash/cache";
import { UpstashRateLimitAdapter } from "@/adapters/cache-upstash/rate-limit";
import { ViemChainAdapter } from "@/adapters/chain-viem/chain";
import { getDatabase } from "@/adapters/db-drizzle/client";
import { DrizzlePersistenceAdapter } from "@/adapters/db-drizzle/persistence";
import { HostedReadinessAdapter } from "@/adapters/health-hosted/readiness";
import { QStashQueueAdapter } from "@/adapters/queue-qstash/queue";
import { SafeApiAdapter } from "@/adapters/safe-api/safe-data";
import { RpcSimulationAdapter } from "@/adapters/simulator-rpc/simulation";
import { ImportSafeService } from "@/core/safes/import-safe";

let abi: PublicAbiAdapter | null = null;
let chain: ViemChainAdapter | null = null;
let persistence: DrizzlePersistenceAdapter | null = null;
let cache: UpstashCacheAdapter | null = null;
let queue: QStashQueueAdapter | null = null;
let readiness: HostedReadinessAdapter | null = null;
let rateLimit: UpstashRateLimitAdapter | null = null;
let safeData: SafeApiAdapter | null = null;
let simulation: RpcSimulationAdapter | null = null;

export function getChainPort() {
  chain ??= new ViemChainAdapter();
  return chain;
}

export function getAbiPort() {
  abi ??= new PublicAbiAdapter(getChainPort());
  return abi;
}

export function getPersistencePort() {
  persistence ??= new DrizzlePersistenceAdapter(getDatabase());
  return persistence;
}

export function getCachePort() {
  cache ??= new UpstashCacheAdapter();
  return cache;
}

export function getReadinessPort() {
  readiness ??= new HostedReadinessAdapter();
  return readiness;
}

export function getRateLimitPort() {
  rateLimit ??= new UpstashRateLimitAdapter();
  return rateLimit;
}

export function getQueuePort() {
  queue ??= new QStashQueueAdapter();
  return queue;
}

export function getSafeDataPort() {
  safeData ??= new SafeApiAdapter();
  return safeData;
}

export function getSimulationPort() {
  simulation ??= new RpcSimulationAdapter();
  return simulation;
}

export function getImportSafeService() {
  return new ImportSafeService(
    getChainPort(),
    getPersistencePort(),
    getQueuePort(),
  );
}
