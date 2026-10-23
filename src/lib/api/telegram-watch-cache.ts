import type { Page, SafeRef } from "@/core/domain";
import type { CachePort } from "@/core/ports";

export const TELEGRAM_WATCH_REGISTRY_TTL_SECONDS = 6 * 60 * 60;
export const TELEGRAM_WATCH_STATE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const TELEGRAM_WATCH_HEALTH_TTL_SECONDS = 15 * 60;

const REGISTRY_PREFIX = "telegram:watch-registry:v1:";
const STATE_PREFIX = "telegram:watch-state:v1:";
const HEALTH_PREFIX = "telegram:watch-health:v1:";

export interface TelegramWatchHealth {
  readonly checkedAt: number;
  readonly error: string | null;
}

export function telegramWatchRegistryKey(cursor: string | null): string {
  return `${REGISTRY_PREFIX}${cursor ?? "root"}`;
}

export function telegramWatchStateKey(safe: SafeRef): string {
  return `${STATE_PREFIX}${safe.chainId}:${safe.address.toLowerCase()}`;
}

export function telegramWatchHealthKey(safe: SafeRef): string {
  return `${HEALTH_PREFIX}${safe.chainId}:${safe.address.toLowerCase()}`;
}

export async function invalidateTelegramWatchRegistry(
  cache: CachePort,
): Promise<void> {
  try {
    await cache.deleteByPrefix(REGISTRY_PREFIX);
  } catch (error) {
    console.error("[telegram-watch] registry cache invalidation failed", {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
  }
}

export async function readTelegramWatchHealth(
  cache: CachePort,
  safe: SafeRef,
): Promise<TelegramWatchHealth | null> {
  try {
    return await cache.get<TelegramWatchHealth>(telegramWatchHealthKey(safe));
  } catch {
    return null;
  }
}

export type TelegramWatchRegistryPage = Page<SafeRef>;
