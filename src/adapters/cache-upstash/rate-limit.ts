import { getRedisClient } from "@/adapters/cache-upstash/client";
import type { RateLimitDecision, RateLimitPort } from "@/core/ports";

const CONSUME_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
local ttl = redis.call("TTL", KEYS[1])
if current == 1 or ttl < 0 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`;

export function toRateLimitDecision(
  current: number,
  ttlSeconds: number,
  limit: number,
): RateLimitDecision {
  return {
    allowed: current <= limit,
    remaining: Math.max(0, limit - current),
    retryAfterSeconds: Math.max(1, ttlSeconds),
  };
}

export class UpstashRateLimitAdapter implements RateLimitPort {
  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitDecision> {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("Rate-limit count must be a positive integer.");
    }
    if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
      throw new Error("Rate-limit window must be a positive integer.");
    }

    const [current, ttl] = await getRedisClient().eval<
      [string],
      [number, number]
    >(CONSUME_SCRIPT, [key], [String(windowSeconds)]);

    return toRateLimitDecision(Number(current), Number(ttl), limit);
  }
}
