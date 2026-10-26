"use client";

import { pinFor, type ActivityView } from "@/lib/logic";
import { project } from "@/lib/format";

export function CityMap({
  views,
  selectedId,
  onSelect,
}: {
  views: ActivityView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const placed = views
    .map((view) => {
      const point = pinFor(view.venue, false);
      const pos = project(point.lat, point.lng);
      return pos ? { view, pos } : null;
    })
    .filter((item): item is { view: ActivityView; pos: { x: number; y: number } } => item != null);

  return (
    <div className="relative min-h-[28rem] overflow-hidden rounded-[1.8rem] bg-[#d5efe8] shadow-[inset_0_0_0_1px_rgb(26_39_68_/_0.05)]">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        <path d="M0 8 C10 20 8 62 0 96 L0 8" fill="#8ecfc6" />
        <path d="M72 0 C86 12 96 30 100 42 L100 0 Z" fill="#7fc6bd" />
        <path d="M76 18 C88 28 90 48 78 54 C70 42 68 26 76 18" fill="#b7e4dc" />
        <circle cx="18" cy="78" r="7" fill="#f4e7cf" opacity="0.7" />
        <circle cx="62" cy="34" r="10" fill="#f6efe2" opacity="0.45" />
      </svg>
      <p className="absolute top-4 left-4 max-w-[14rem] text-xs font-semibold tracking-wide text-[#24584f] uppercase">Central Dubai, schematic</p>
      {[
        ["Marina", 12, 84],
        ["JLT", 16, 90],
        ["Kite Beach", 34, 58],
        ["Alserkal", 46, 66],
        ["DIFC", 64, 36],
        ["Al Fahidi", 72, 16],
        ["Creek", 88, 22],
      ].map(([label, x, y]) => (
        <span key={label} className="absolute text-[10px] font-semibold text-[#2d6158]" style={{ left: `${x}%`, top: `${y}%` }}>
          {label}
        </span>
      ))}
      {placed.map(({ view, pos }) => {
        const selected = view.activity.id === selectedId;
        const live = view.phase === "live";
        return (
          <button
            key={view.activity.id}
            type="button"
            onClick={() => onSelect(view.activity.id)}
            className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-cream shadow-md ${selected ? "z-20 h-11 w-11 bg-coral text-white" : "z-10 h-8 w-8 bg-navy text-white"}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            aria-label={view.activity.title}
            aria-pressed={selected}
          >
            {live ? <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-tangerine" /> : <span className="text-[10px] font-bold">{view.spotsLeft > 0 ? view.spotsLeft : "•"}</span>}
          </button>
        );
      })}
    </div>
  );
}
