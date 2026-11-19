import { getReadinessPort } from "@/container";
import { checkReadiness } from "@/core/health/readiness";

const CACHE_CONTROL =
  "public, max-age=0, s-maxage=15, stale-while-revalidate=30";

export async function GET(request: Request) {
  if (new URL(request.url).search) {
    return Response.json(
      { service: "safe-inspector", status: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const readiness = await checkReadiness(getReadinessPort());

  return Response.json(
    {
      service: "safe-inspector",
      status: readiness.healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
    },
    {
      status: readiness.healthy ? 200 : 503,
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}
