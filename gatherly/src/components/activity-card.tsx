"use client";

import Link from "next/link";
import { formatWhen, money } from "@/lib/format";
import type { ActivityView } from "@/lib/logic";
import { useApp } from "./store";
import { Cover, EnergyPill, Portrait, Stack } from "./ui";

export function ActivityCard({
  view,
  layout = "stack",
}: {
  view: ActivityView;
  layout?: "stack" | "rail";
}) {
  const { state, api } = useApp();
  const me = state.users.find((user) => user.id === state.sessionUserId);
  const saved = Boolean(me && state.saved.some((item) => item.userId === me.id && item.activityId === view.activity.id));
  const when = formatWhen(view.activity.startsAt);
  const spots = view.spotsLeft <= 0 ? "Full" : `${view.spotsLeft} left`;
  const rail = layout === "rail";

  async function share(event: React.MouseEvent) {
    event.preventDefault();
    const url = `${window.location.origin}/activity/${view.activity.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: view.activity.title, url });
      } catch {
        /* The share sheet can be dismissed. */
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    api.clearToast();
  }

  return (
    <article className={`relative overflow-hidden rounded-[1.6rem] bg-cream shadow-[0_12px_40px_rgb(26_39_68_/_0.06)] ${rail ? "w-[17.5rem] shrink-0 snap-start" : ""}`}>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? "Unsave gathering" : "Save gathering"}
        onClick={() => api.toggleSave(view.activity.id)}
        className="absolute top-3 right-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-cream/95 text-lg"
      >
        {saved ? "★" : "☆"}
      </button>
      <Link href={`/activity/${view.activity.id}`} className="block">
        <div className={`relative ${rail ? "h-40" : "h-52"}`}>
          <Cover src={view.activity.cover} alt="" />
          <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
            <EnergyPill energy={view.activity.energy} />
            <span className="rounded-full bg-navy/85 px-2.5 py-1 text-xs font-semibold text-white">{spots}</span>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div>
            <h3 className="font-display text-[1.45rem] leading-tight">{view.activity.title}</h3>
            <p className="mt-1 text-sm text-muted">
              {when.label} · {view.distanceLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Portrait user={view.host} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{view.host.name}</p>
              <p className="text-xs text-muted">{view.activity.audience === "women-only" ? "Women-only" : view.activity.audience === "approval" ? "Host confirms" : view.activity.audience === "private" ? "Private invite" : "Open gathering"}</p>
            </div>
            <p className="ml-auto text-sm font-bold">{money(view.activity.price)}</p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Stack users={view.attendees} />
            <p className="max-w-[12rem] text-right text-xs leading-5 text-teal">{view.fit.score}% · {view.fit.reasons[0]}</p>
          </div>
        </div>
      </Link>
      <div className="px-4 pb-4">
        <button type="button" onClick={share} className="text-sm font-semibold text-muted">
          Share
        </button>
      </div>
    </article>
  );
}
