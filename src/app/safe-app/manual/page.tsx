import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manual Inspector · Safe Inspector Preview",
  description:
    "Open the full read-only Safe Inspector manually, inside or outside Safe Global.",
};

export default function ManualSafeInspectorPage() {
  if (process.env.VERCEL_ENV !== "preview") notFound();
  redirect("/safes");
}
