import { Redis } from "@upstash/redis";

import type { CachePort } from "@/core/ports";

function createRedis() {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    throw new Error(
      "Upstash Redis is not configured. Provision it through the Vercel Marketplace and pull environment variables.",
    );
  }
  return Redis.fromEnv();
}

let redis: ReturnType<typeof createRedis> | null = null;

function getRedis() {
  redis ??= createRedis();
  return redis;
}

export class UpstashCacheAdapter implements CachePort {
  async get<T>(key: string): Promise<T | null> {
    return getRedis().get<T>(key);
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number | null,
  ): Promise<void> {
    if (ttlSeconds === null) {
      await getRedis().set(key, value);
      return;
    }
    await getRedis().set(key, value, { ex: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await getRedis().del(key);
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let cursor = 0;
    let deleted = 0;

    do {
      const [nextCursor, keys] = await getRedis().scan(cursor, {
        match: `${prefix}*`,
        count: 100,
      });
      cursor = Number(nextCursor);
      if (keys.length > 0) deleted += await getRedis().del(...keys);
    } while (cursor !== 0);

    return deleted;
  }
}
