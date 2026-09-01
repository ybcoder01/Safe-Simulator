import { getRedisClient } from "@/adapters/cache-upstash/client";
import type { CachePort } from "@/core/ports";

export class UpstashCacheAdapter implements CachePort {
  async get<T>(key: string): Promise<T | null> {
    return getRedisClient().get<T>(key);
  }

  async set<T>(
    key: string,
    value: T,
    ttlSeconds: number | null,
  ): Promise<void> {
    if (ttlSeconds === null) {
      await getRedisClient().set(key, value);
      return;
    }
    await getRedisClient().set(key, value, { ex: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await getRedisClient().del(key);
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    let cursor = 0;
    let deleted = 0;

    do {
      const [nextCursor, keys] = await getRedisClient().scan(cursor, {
        match: `${prefix}*`,
        count: 100,
      });
      cursor = Number(nextCursor);
      if (keys.length > 0) deleted += await getRedisClient().del(...keys);
    } while (cursor !== 0);

    return deleted;
  }
}
