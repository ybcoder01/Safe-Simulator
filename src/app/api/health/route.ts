import { getReadinessPort } from "@/container";
import { checkReadiness } from "@/core/health/readiness";

const CACHE_CONTROL =
  "public, max-age=0, s-maxage=15, stale-while-revalidate=30";

export async function GET() {
  const readiness = await checkReadiness(getReadinessPort());

  return Response.json(
    {
      service: "safe-inspector",
      status: readiness.healthy ? "ok" : "degraded",
      checks: readiness.checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: readiness.healthy ? 200 : 503,
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}
