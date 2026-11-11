import { notFound } from "next/navigation";

import { SafeAppInstall } from "@/components/safes/safe-app-install";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Use with Safe · Safe Inspector Preview",
  description:
    "Add Safe Inspector as a custom Safe App to review transactions before signing.",
};

export default function UseWithSafePage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();

  return (
    <main className="workspace shell">
      <header className="workspace-header">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>Safe Inspector</span>
        </a>
        <span className="preview-pill">Preview only</span>
      </header>

      <SafeAppInstall />

      <footer className="workspace-footer">
        <a className="text-link" href="/">
          Return to overview
        </a>
        <span>No wallet connection or signature is requested here</span>
      </footer>
    </main>
  );
}
