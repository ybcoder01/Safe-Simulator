"use client";

import Link from "next/link";
import { useState } from "react";
import { project } from "@/lib/format";
import { discoverable, matchesQuery, pinFor } from "@/lib/logic";
import { ActivityCard } from "@/components/activity-card";
import { CityMap } from "@/components/city-map";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { EmptyArt } from "@/components/ui";

export default function MapPage() {
  const { state, me, pref } = useViewer();
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  if (!me || !pref) return null;
  const views = discoverable(state, me, pref, now).filter((view) => matchesQuery(view, state.filters, now));
  const away = views.filter((view) => project(pinFor(view.venue, false).lat, pinFor(view.venue, false).lng) == null);
  const current = views.find((view) => view.activity.id === selected) ?? views[0] ?? null;

  return (
    <main className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[1.2fr_0.8fr]">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="font-display text-4xl">Map</h1>
          <Link href="/search" className="rounded-full bg-cream px-4 py-2 text-sm font-semibold">List and filters</Link>
        </div>
        <CityMap views={views} selectedId={current?.activity.id ?? null} onSelect={setSelected} />
        <p className="mt-2 text-xs leading-5 text-muted">Pins use the public neighborhood, never a private door. Hatta and other far plans sit below the map.</p>
        {away.length > 0 ? (
          <div className="mt-4">
            <h2 className="font-display text-2xl">Further out</h2>
            <div className="mt-3 grid gap-3">
              {away.map((view) => (
                <ActivityCard key={view.activity.id} view={view} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <aside>
        {current ? <ActivityCard view={current} /> : <EmptyArt title="No pins yet" body="Clear a filter or widen the search. The map follows the same list as Discover." />}
      </aside>
    </main>
  );
}
