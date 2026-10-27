"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/copy";
import { countdown, formatWhen, greeting } from "@/lib/format";
import { activityView, discoverable, phaseOf } from "@/lib/logic";
import { EMPTY_FILTERS } from "@/lib/types";
import { ActivityCard } from "@/components/activity-card";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { Cover, EmptyArt, Icon, Portrait } from "@/components/ui";

export default function DiscoverPage() {
  const { state, api, me, pref } = useViewer();
  const now = useNow();
  const router = useRouter();
  if (!me || !pref) return null;
  const views = discoverable(state, me, pref, now);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(now);
  const today = views.filter((view) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(new Date(view.activity.startsAt)) === todayKey);
  const forYou = views.slice().sort((a, b) => b.fit.score - a.fit.score).slice(0, 4);
  const small = views.filter((view) => view.activity.capacity <= 6).slice(0, 4);
  const lastMinute = views.filter((view) => view.spotsLeft > 0 && view.spotsLeft <= 2).slice(0, 4);
  const mine = state.activities
    .map((activity) => activityView(state, activity.id, me, pref, now))
    .filter((view): view is NonNullable<typeof view> => view != null)
    .filter((view) => {
      const involved = view.activity.hostId === me.id || view.myWaitIndex != null || ["going", "checked-in", "pending", "invited"].includes(view.myRsvp?.status ?? "");
      return involved && view.phase !== "past" && view.phase !== "cancelled";
    })
    .sort((a, b) => a.activity.startsAt.localeCompare(b.activity.startsAt));
  const notices = state.notices.filter((notice) => notice.userId === me.id && !notice.read).length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{greeting(now)}, {me.name.split(" ")[0]}</p>
          <h1 className="font-display text-4xl leading-none">Dubai</h1>
          <p className="mt-1 text-sm text-muted">{me.neighborhood} · plans, not profiles</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/notifications" className="relative grid h-11 w-11 place-items-center rounded-full bg-cream" aria-label="Notifications">
            <Icon name="bell" />
            {notices > 0 ? <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-coral" /> : null}
          </Link>
          <Portrait user={me} size={44} />
        </div>
      </header>

      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          api.setFilters({ ...EMPTY_FILTERS, query: String(data.get("q") ?? "") });
          router.push("/search");
        }}
      >
        <label className="sr-only" htmlFor="q">Search gatherings</label>
        <input id="q" name="q" placeholder="Coffee, creek, Arabic, a small dinner…" className="w-full rounded-full border border-line bg-cream px-5 py-3 text-base" />
      </form>

      <div className="mt-4 flex gap-2">
        <Link href="/map" className="rounded-full bg-cream px-4 py-2 text-sm font-semibold">Map</Link>
        <Link href="/search" className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Filters</Link>
      </div>

      {mine[0] ? (
        <section className="rise mt-6 overflow-hidden rounded-[1.8rem] bg-navy text-white">
          <div className="grid md:grid-cols-[1.1fr_0.9fr]">
            <div className="p-5">
              <p className="text-xs font-semibold tracking-[0.14em] text-tangerine uppercase">Your next gathering</p>
              <h2 className="font-display mt-2 text-3xl">{mine[0].activity.title}</h2>
              <p className="mt-2 text-sm text-white/75">{formatWhen(mine[0].activity.startsAt).label} · {countdown(mine[0].activity.startsAt, now)}</p>
              <p className="mt-3 max-w-md text-sm leading-6 text-white/80">
                {mine[0].phase === "live" ? "It's happening. Event mode is there if the room wants a prompt, not because the phone should win." : "The room is already open for introductions, a poll, and a note if you're on the way."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={mine[0].phase === "live" ? `/activity/${mine[0].activity.id}/live` : `/activity/${mine[0].activity.id}/room`} className="rounded-full bg-coral px-4 py-2 text-sm font-semibold">
                  {mine[0].phase === "live" ? "Enter event mode" : "Open the room"}
                </Link>
                <Link href={`/activity/${mine[0].activity.id}`} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">Details</Link>
              </div>
            </div>
            <div className="hidden min-h-48 md:block">
              <Cover src={mine[0].activity.cover} alt="" />
            </div>
          </div>
        </section>
      ) : null}

      <Rail title="Happening today" views={today} empty="Nothing else is scheduled for today. Tomorrow still counts." />
      <Rail title="Why these fit" views={forYou} empty="Save a few interests in settings and the fit gets more specific." />

      <section className="mt-8">
        <h2 className="font-display text-2xl">Go by mood</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CATEGORIES.map((category) => (
            <button
              key={category.type}
              type="button"
              onClick={() => {
                api.setFilters({ ...EMPTY_FILTERS, type: category.type });
                router.push("/search");
              }}
              className={`rounded-3xl px-4 py-4 text-left text-sm font-semibold ${category.tint}`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </section>

      <Rail title="Small circles" views={small} empty="The smallest plans are full right now." />

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl">Communities gathering soon</h2>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {state.communities.map((community) => {
            const upcoming = state.activities.filter((activity) => activity.communityId === community.id && activity.status !== "cancelled" && phaseOf(activity, now) !== "past").length;
            return (
              <Link key={community.id} href={`/community/${community.id}`} className="overflow-hidden rounded-[1.5rem] bg-cream">
                <div className="h-28">
                  <Cover src={community.cover} alt="" />
                </div>
                <div className="p-4">
                  <h3 className="font-display text-2xl leading-tight">{community.name}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted">{community.summary}</p>
                  <p className="mt-2 text-xs font-semibold text-teal">{upcoming} upcoming {upcoming === 1 ? "plan" : "plans"}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <Rail title="Last-minute openings" views={lastMinute} empty="No tight openings. The waitlist still moves when someone cancels." />
    </main>
  );
}

function Rail({ title, views, empty }: { title: string; views: ReturnType<typeof discoverable>; empty: string }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">{title}</h2>
      {views.length === 0 ? (
        <div className="mt-3">
          <EmptyArt title="A quiet hour" body={empty} />
        </div>
      ) : (
        <div className="scroll-x mt-3 flex snap-x gap-3 overflow-x-auto pb-2">
          {views.map((view) => (
            <ActivityCard key={view.activity.id} view={view} layout="rail" />
          ))}
        </div>
      )}
    </section>
  );
}
