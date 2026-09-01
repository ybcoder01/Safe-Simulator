import { sql } from "drizzle-orm";

import { getRedisClient } from "@/adapters/cache-upstash/client";
import { getDatabase } from "@/adapters/db-drizzle/client";
import type { ReadinessPort } from "@/core/ports";

export class HostedReadinessAdapter implements ReadinessPort {
  async checkDatabase(): Promise<void> {
    await getDatabase().execute(sql`select 1`);
  }

  async checkCache(): Promise<void> {
    const response = await getRedisClient().ping();
    if (response !== "PONG") {
      throw new Error("Cache readiness check returned an invalid response.");
    }
  }
}
