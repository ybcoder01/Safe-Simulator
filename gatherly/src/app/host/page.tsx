"use client";

import Link from "next/link";
import { formatWhen } from "@/lib/format";
import { phaseOf } from "@/lib/logic";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { EmptyArt } from "@/components/ui";

export default function HostListPage() {
  const { state, me } = useViewer();
  const now = useNow();
  if (!me) return null;
  const mine = state.activities.filter((activity) => activity.hostId === me.id).slice().sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Hosting</h1>
        <Link href="/create" className="rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white">New plan</Link>
      </div>
      <ul className="mt-4 grid gap-2">
        {mine.map((activity) => {
          const phase = activity.status === "cancelled" ? "cancelled" : phaseOf(activity, now);
          return (
            <li key={activity.id}>
              <Link href={`/host/${activity.id}`} className="block rounded-3xl bg-cream px-4 py-3">
                <span className="font-semibold">{activity.title}</span>
                <span className="mt-1 block text-sm text-muted">{formatWhen(activity.startsAt).label} · {phase}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {mine.length === 0 ? <div className="mt-4"><EmptyArt title="No gatherings yet" body="A coffee for four is a complete hosting career to start with." /></div> : null}
    </main>
  );
}
