import type { ReadinessPort } from "@/core/ports";

export type ReadinessCheckStatus = "ok" | "unavailable";

export interface ReadinessResult {
  readonly healthy: boolean;
  readonly checks: {
    readonly database: ReadinessCheckStatus;
    readonly cache: ReadinessCheckStatus;
  };
}

async function checkDependency(
  check: () => Promise<void>,
  timeoutMs: number,
): Promise<ReadinessCheckStatus> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Readiness check timed out.")),
          timeoutMs,
        );
      }),
    ]);
    return "ok";
  } catch {
    return "unavailable";
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function checkReadiness(
  port: ReadinessPort,
  timeoutMs = 3_000,
): Promise<ReadinessResult> {
  const [database, cache] = await Promise.all([
    checkDependency(() => port.checkDatabase(), timeoutMs),
    checkDependency(() => port.checkCache(), timeoutMs),
  ]);

  return {
    healthy: database === "ok" && cache === "ok",
    checks: { database, cache },
  };
}
