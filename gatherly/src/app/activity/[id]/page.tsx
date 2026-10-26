"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { icsBody, formatWhen, money } from "@/lib/format";
import { activityView, hostReputation, reliability } from "@/lib/logic";
import { CityMap } from "@/components/city-map";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { Cover, EnergyPill, Icon, Portrait, Sheet, Stack } from "@/components/ui";

export default function ActivityPage() {
  const params = useParams<{ id: string }>();
  const { state, api, me, pref } = useViewer();
  const now = useNow();
  const [reportOpen, setReportOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [asked, setAsked] = useState(false);
  const [reason, setReason] = useState("Safety");
  const [details, setDetails] = useState("");
  const view = me && pref ? activityView(state, params.id, me, pref, now) : null;
  const status = view?.myRsvp?.status ?? "";
  const waitSpot = view?.myWaitIndex ?? 0;
  useEffect(() => {
    if (!asked) return;
    if (status === "going" || status === "pending" || waitSpot > 0) setConfirm(true);
    setAsked(false);
  }, [asked, status, waitSpot]);
  if (!me || !pref) return null;
  if (!view) return <main className="p-6">That gathering isn't here.</main>;
  const when = formatWhen(view.activity.startsAt);
  const rep = hostReputation(view.host.id, state);
  const trust = reliability(view.host.id, state.rsvps);
  const joined = view.myRsvp?.status === "going" || view.myRsvp?.status === "checked-in";
  const hosting = view.activity.hostId === me.id;

  function join() {
    if (!view) return;
    api.join(view.activity.id);
    setAsked(true);
  }

  function saveCalendar() {
    const blob = new Blob([icsBody(view!.activity, view!.venue, view!.exact)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gatherly.ics";
    link.click();
    URL.revokeObjectURL(url);
  }

  const primary = hosting
    ? { href: `/host/${view.activity.id}`, label: "Host dashboard" }
    : view.phase === "live" && joined
      ? { href: `/activity/${view.activity.id}/live`, label: "Enter event mode" }
      : view.phase === "past" && view.myRsvp?.status === "attended"
        ? { href: `/activity/${view.activity.id}/after`, label: "People you met" }
        : joined
          ? { href: `/activity/${view.activity.id}/room`, label: "Open the group room" }
          : null;

  return (
    <main className="mx-auto max-w-3xl pb-28">
      <div className="relative h-72 sm:h-96">
        <Cover src={view.activity.cover} alt="" />
        <Link href="/discover" className="absolute top-4 left-4 grid h-11 w-11 place-items-center rounded-full bg-cream" aria-label="Back">
          <Icon name="back" />
        </Link>
      </div>
      <div className="px-4">
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <EnergyPill energy={view.activity.energy} />
          <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold">{view.activity.type}</span>
          {view.activity.audience === "women-only" ? <span className="rounded-full bg-[#fde2ea] px-2.5 py-1 text-xs font-semibold">Women-only</span> : null}
          {view.activity.audience === "approval" ? <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold">Host confirms</span> : null}
          {view.activity.audience === "private" ? <span className="rounded-full bg-cream px-2.5 py-1 text-xs font-semibold">Private</span> : null}
          {view.phase === "live" ? <span className="rounded-full bg-coral px-2.5 py-1 text-xs font-semibold text-white">Live</span> : null}
        </div>
        <h1 className="font-display mt-3 text-4xl leading-tight">{view.activity.title}</h1>
        <p className="mt-2 text-muted">{when.label} · {view.activity.durationMin} min · {view.distanceLabel}</p>
        <p className="mt-1 font-semibold">{money(view.activity.price)} · {view.spotsLeft > 0 ? `${view.spotsLeft} places left` : "Full"} of {view.activity.capacity}</p>

        <section className="mt-5 rounded-[1.5rem] bg-[#fff4ec] p-4">
          <h2 className="font-display text-2xl">Why you'll fit in</h2>
          <p className="mt-1 text-sm font-semibold text-coral-deep">{view.fit.score}% from interests and preferences</p>
          <ul className="mt-2 grid gap-1 text-sm leading-6">
            {view.fit.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </section>

        <section className="mt-5 grid gap-2 sm:grid-cols-3">
          {[
            ["Before", "Introductions, polls, and a reminder.", joined || hosting ? `/activity/${view.activity.id}/room` : null],
            ["During", "Optional cards, a vote, and check-in.", view.phase !== "upcoming" && (joined || hosting) ? `/activity/${view.activity.id}/live` : null],
            ["After", "Mutual connections and private feedback.", view.phase === "past" && (view.myRsvp?.status === "attended" || hosting) ? `/activity/${view.activity.id}/after` : null],
          ].map(([label, copy, href]) =>
            href ? (
              <Link key={label} href={href} className="rounded-3xl bg-cream p-4">
                <p className="text-xs font-semibold tracking-wide text-teal uppercase">{label}</p>
                <p className="mt-1 text-sm leading-6">{copy}</p>
              </Link>
            ) : (
              <div key={label} className="rounded-3xl bg-cream/70 p-4 text-muted">
                <p className="text-xs font-semibold tracking-wide uppercase">{label}</p>
                <p className="mt-1 text-sm leading-6">{copy}</p>
              </div>
            ),
          )}
        </section>

        <section className="mt-6 flex items-center gap-3">
          <Portrait user={view.host} size={56} />
          <div>
            <Link href={`/people/${view.host.id}`} className="font-semibold">{view.host.name}</Link>
            <p className="text-sm text-muted">{view.host.headline}</p>
            <p className="text-xs text-teal">{trust.label}{rep ? ` · ${rep.average} from ${rep.count} private notes` : ""}</p>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-2xl">Who's coming</h2>
          <div className="mt-3 flex items-center gap-3">
            <Stack users={view.attendees} size={40} />
            <p className="text-sm text-muted">{view.attendees.length} confirmed{view.waitCount ? ` · ${view.waitCount} waiting` : ""}{view.myWaitIndex ? ` · you are #${view.myWaitIndex}` : ""}</p>
          </div>
        </section>

        <p className="mt-6 text-base leading-7">{view.activity.description}</p>
        <dl className="mt-4 grid gap-2 text-sm">
          <div className="rounded-2xl bg-cream p-3"><dt className="font-semibold">Where</dt><dd>{view.where}</dd><dd className="text-muted">{view.exact ? view.venue.meetingNote : "The exact point stays hidden until you're confirmed."}</dd></div>
          <div className="rounded-2xl bg-cream p-3"><dt className="font-semibold">Languages</dt><dd>{view.activity.languages.join(", ")}</dd></div>
          <div className="rounded-2xl bg-cream p-3"><dt className="font-semibold">Access</dt><dd>{view.activity.accessibility.join(" · ")} · {view.activity.experience}</dd></div>
          <div className="rounded-2xl bg-cream p-3"><dt className="font-semibold">Cancellation</dt><dd>{view.activity.cancellationPolicy}</dd></div>
        </dl>
        <div className="mt-4">
          <CityMap views={[view]} selectedId={view.activity.id} onSelect={() => undefined} />
        </div>
        <section className="mt-4">
          <h2 className="text-sm font-semibold">Community guidelines</h2>
          <ul className="mt-2 grid gap-1 text-sm leading-6 text-muted">
            {view.activity.guidelines.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        {view.community ? <Link href={`/community/${view.community.id}`} className="mt-4 block text-sm font-semibold text-teal">Part of {view.community.name}. You can come without joining it.</Link> : null}
        <button type="button" onClick={() => setReportOpen(true)} className="mt-4 text-sm font-semibold text-muted">Report this gathering</button>
      </div>

      <div className="fixed inset-x-0 bottom-20 z-20 px-4 md:bottom-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          {primary ? (
            <Link href={primary.href} className="flex-1 rounded-full bg-navy py-3 text-center font-semibold text-white">{primary.label}</Link>
          ) : view.myRsvp?.status === "pending" ? (
            <button type="button" onClick={() => api.leave(view.activity.id)} className="flex-1 rounded-full bg-cream py-3 font-semibold">Request pending · withdraw</button>
          ) : view.myWaitIndex ? (
            <button type="button" onClick={() => api.leave(view.activity.id)} className="flex-1 rounded-full bg-cream py-3 font-semibold">Leave waitlist #{view.myWaitIndex}</button>
          ) : view.phase === "past" ? (
            <p className="flex-1 rounded-full bg-cream py-3 text-center text-sm">This one already happened.</p>
          ) : (
            <button type="button" onClick={join} className="flex-1 rounded-full bg-coral py-3 font-semibold text-white">
              {view.activity.audience === "women-only" && !me.includeWomenOnly ? "Women-only" : view.spotsLeft <= 0 ? "Join the waitlist" : view.activity.audience === "approval" ? "Request to join" : view.myRsvp?.status === "invited" ? "Accept invite" : "Join gathering"}
            </button>
          )}
          {joined ? <button type="button" onClick={() => api.leave(view.activity.id)} className="rounded-full bg-cream px-4 py-3 text-sm font-semibold">Cancel</button> : null}
        </div>
      </div>

      <Sheet open={confirm} title={view.myRsvp?.status === "going" ? "You're in" : view.myWaitIndex ? "You're on the list" : "One more step"} onClose={() => setConfirm(false)}>
        {view.myRsvp?.status === "going" ? (
          <div className="grid gap-3 text-sm leading-6">
            <p>A place is saved. We'll remind you 24 hours before, and you can cancel any time so the next person can come.</p>
            <button type="button" onClick={saveCalendar} className="rounded-full bg-navy py-3 font-semibold text-white">Add to calendar</button>
            <Link href={`/activity/${view.activity.id}/room`} className="rounded-full bg-coral py-3 text-center font-semibold text-white">Say hello in the room</Link>
          </div>
        ) : view.myRsvp?.status === "pending" ? (
          <p className="text-sm leading-6">The host has your request. The exact meeting point stays hidden until they confirm, and a no is private.</p>
        ) : (
          <p className="text-sm leading-6">If a place opens, you move up automatically. Nobody is shown as rejected.</p>
        )}
      </Sheet>

      <Sheet open={reportOpen} title="Report" onClose={() => setReportOpen(false)}>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            api.report({ targetUserId: view.host.id, activityId: view.activity.id, reason, details });
            setReportOpen(false);
          }}
        >
          <label className="text-sm font-semibold" htmlFor="reason">
            What happened
            <select id="reason" value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-2xl border border-line bg-white px-3 py-3">
              {["Safety", "Harassment", "Spam", "Wrong place or access info", "Someone won't take no"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold" htmlFor="details">
            Details
            <textarea id="details" value={details} onChange={(event) => setDetails(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-2xl border border-line bg-white px-3 py-3" />
          </label>
          <button type="submit" className="rounded-full bg-navy py-3 font-semibold text-white">Send to moderation</button>
        </form>
      </Sheet>
    </main>
  );
}
