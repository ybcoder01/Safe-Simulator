import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { contentSecurityPolicy } from "@/lib/security/content-security-policy";

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const policy = contentSecurityPolicy(
    nonce,
    request.nextUrl.pathname === "/safe-app" ||
      request.nextUrl.pathname.startsWith("/safe-app/"),
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
