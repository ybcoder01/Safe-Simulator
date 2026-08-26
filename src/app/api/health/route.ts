export function GET() {
  return Response.json(
    {
      service: "safe-inspector",
      status: "ok",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
