"use client";

import Link from "next/link";
import { CATEGORIES, LANGUAGES } from "@/lib/copy";
import { discoverable, matchesQuery } from "@/lib/logic";
import { EMPTY_FILTERS, type Energy, type Filters } from "@/lib/types";
import { ActivityCard } from "@/components/activity-card";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { EmptyArt, inputClass } from "@/components/ui";

export default function SearchPage() {
  const { state, api, me, pref } = useViewer();
  const now = useNow();
  if (!me || !pref) return null;
  const filters = state.filters;
  const results = discoverable(state, me, pref, now).filter((view) => matchesQuery(view, filters, now));
  const set = (patch: Partial<Filters>) => api.setFilters({ ...filters, ...patch });

  return (
    <main className="mx-auto max-w-5xl px-4 py-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl">Search</h1>
        <Link href="/map" className="rounded-full bg-cream px-4 py-2 text-sm font-semibold">Map</Link>
      </div>
      <label className="mt-4 block text-sm font-semibold" htmlFor="query">
        What kind of plan
        <input id="query" value={filters.query} onChange={(event) => set({ query: event.target.value })} placeholder="Host, neighborhood, or activity" className={`${inputClass} mt-1.5`} />
      </label>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select label="When" value={filters.when} onChange={(when) => set({ when: when as Filters["when"] })} options={[["any", "Any day"], ["today", "Today"], ["tomorrow", "Tomorrow"], ["weekend", "Weekend"]]} />
        <Select label="Distance" value={filters.distanceKm == null ? "any" : String(filters.distanceKm)} onChange={(value) => set({ distanceKm: value === "any" ? null : Number(value) })} options={[["any", "Any distance"], ["3", "Within 3 km"], ["8", "Within 8 km"], ["20", "Within 20 km"]]} />
        <Select label="Group" value={filters.group} onChange={(group) => set({ group: group as Filters["group"] })} options={[["any", "Any size"], ["intimate", "4–6"], ["small", "7–10"]]} />
        <Select label="Price" value={filters.price} onChange={(price) => set({ price: price as Filters["price"] })} options={[["any", "Any price"], ["free", "Free"], ["under80", "Under AED 80"]]} />
        <Select label="Language" value={filters.language ?? "any"} onChange={(language) => set({ language: language === "any" ? null : language })} options={[["any", "Any language"], ...LANGUAGES.map((language) => [language, language] as [string, string])]} />
        <Select label="Pace" value={filters.energy ?? "any"} onChange={(energy) => set({ energy: energy === "any" ? null : (energy as Energy) })} options={[["any", "Any pace"], ["Relaxed", "Relaxed"], ["Lively", "Lively"], ["Focused", "Focused"]]} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <button key={category.type} type="button" aria-pressed={filters.type === category.type} onClick={() => set({ type: filters.type === category.type ? null : category.type })} className={`rounded-full px-3 py-2 text-sm font-semibold ${filters.type === category.type ? "bg-navy text-white" : "bg-cream"}`}>
            {category.label}
          </button>
        ))}
        <button type="button" aria-pressed={filters.stepFree} onClick={() => set({ stepFree: !filters.stepFree })} className={`rounded-full px-3 py-2 text-sm font-semibold ${filters.stepFree ? "bg-teal text-white" : "bg-cream"}`}>
          Step-free
        </button>
        <button type="button" aria-pressed={filters.womenOnly === "only"} onClick={() => set({ womenOnly: filters.womenOnly === "only" ? "include" : "only" })} className={`rounded-full px-3 py-2 text-sm font-semibold ${filters.womenOnly === "only" ? "bg-coral text-white" : "bg-cream"}`}>
          Women-only
        </button>
        <button type="button" onClick={() => api.setFilters(EMPTY_FILTERS)} className="rounded-full px-3 py-2 text-sm font-semibold text-muted">
          Clear
        </button>
      </div>
      <p className="mt-4 text-sm text-muted">{results.length} gatherings · sorted by time, not popularity</p>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {results.map((view) => (
          <ActivityCard key={view.activity.id} view={view} />
        ))}
      </div>
      {results.length === 0 ? (
        <div className="mt-4">
          <EmptyArt title="Nothing in this slice" body="Widen the distance or clear a filter. A good plan can sit just outside today's mood." />
        </div>
      ) : null}
    </main>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} mt-1.5`}>
        {options.map(([option, text]) => (
          <option key={option} value={option}>{text}</option>
        ))}
      </select>
    </label>
  );
}
