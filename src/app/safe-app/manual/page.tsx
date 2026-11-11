import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SafeAppManualRedirect() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  redirect("/safes");
}
