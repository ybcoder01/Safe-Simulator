import { sql } from "drizzle-orm";

import { getRedisClient } from "@/adapters/cache-upstash/client";
import { getRpcUrls, getSupportedChain } from "@/adapters/chain-viem/config";
import { getDatabase } from "@/adapters/db-drizzle/client";
import type { ChainId } from "@/core/domain";
import type { ReadinessPort } from "@/core/ports";

const XDC_CHAIN_ID = 50 as ChainId;

async function checkRpcUrl(url: string): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_blockNumber",
      params: [],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error("Execution RPC returned an HTTP error.");

  const payload = (await response.json()) as {
    readonly error?: unknown;
    readonly result?: unknown;
  };
  if (
    payload.error !== undefined ||
    typeof payload.result !== "string" ||
    !/^0x[0-9a-f]+$/i.test(payload.result)
  ) {
    throw new Error("Execution RPC returned an invalid block number.");
  }
}

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

  async checkExecutionRpc(): Promise<void> {
    const urls = getRpcUrls(getSupportedChain(XDC_CHAIN_ID));
    if (urls.length === 0) throw new Error("Execution RPC is not configured.");

    await Promise.any(urls.map((url) => checkRpcUrl(url))).catch(() => {
      throw new Error("No execution RPC endpoint is available.");
    });
  }
}
