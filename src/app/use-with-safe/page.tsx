import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { SafeAppInstall } from "@/components/safes/safe-app-install";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Use with Safe · Safe Inspector Preview",
  description:
    "Add Safe Inspector as a custom Safe App to review transactions before signing.",
};

export default async function UseWithSafePage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const appUrl = host ? `${protocol}://${host}/safe-app` : "/safe-app";

  return (
    <main className="workspace shell">
      <header className="workspace-header">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </Link>
        <span className="preview-pill">Preview only</span>
      </header>

      <SafeAppInstall appUrl={appUrl} />

      <footer className="workspace-footer">
        <Link className="text-link" href="/">
          Return to overview
        </Link>
        <span>No wallet connection or signature is requested here</span>
      </footer>
    </main>
  );
}
