import { UpstashCacheAdapter } from "@/adapters/cache-upstash/cache";
import { ViemChainAdapter } from "@/adapters/chain-viem/chain";
import { getDatabase } from "@/adapters/db-drizzle/client";
import { DrizzlePersistenceAdapter } from "@/adapters/db-drizzle/persistence";
import { QStashQueueAdapter } from "@/adapters/queue-qstash/queue";
import { SafeApiAdapter } from "@/adapters/safe-api/safe-data";
import { ImportSafeService } from "@/core/safes/import-safe";

let chain: ViemChainAdapter | null = null;
let persistence: DrizzlePersistenceAdapter | null = null;
let cache: UpstashCacheAdapter | null = null;
let queue: QStashQueueAdapter | null = null;
let safeData: SafeApiAdapter | null = null;

export function getChainPort() {
  chain ??= new ViemChainAdapter();
  return chain;
}

export function getPersistencePort() {
  persistence ??= new DrizzlePersistenceAdapter(getDatabase());
  return persistence;
}

export function getCachePort() {
  cache ??= new UpstashCacheAdapter();
  return cache;
}

export function getQueuePort() {
  queue ??= new QStashQueueAdapter();
  return queue;
}

export function getSafeDataPort() {
  safeData ??= new SafeApiAdapter();
  return safeData;
}

export function getImportSafeService() {
  return new ImportSafeService(
    getChainPort(),
    getPersistencePort(),
    getQueuePort(),
  );
}
