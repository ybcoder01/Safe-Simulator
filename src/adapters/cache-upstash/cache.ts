import { Redis } from "@upstash/redis";

import type { CachePort } from "@/core/ports";

function createRedis() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.UPSTASH_REDIS_REST_KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Upstash Redis is not configured. Provision it through the Vercel Marketplace and connect it to this project.",
    );
  }

  return new Redis({ url, token });
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
