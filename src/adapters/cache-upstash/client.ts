import { Redis } from "@upstash/redis";

function createRedisClient() {
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

let redis: ReturnType<typeof createRedisClient> | null = null;

export function getRedisClient() {
  redis ??= createRedisClient();
  return redis;
}
