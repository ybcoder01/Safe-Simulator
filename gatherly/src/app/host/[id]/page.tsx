"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { checkInCode, formatWhen } from "@/lib/format";
import { checkInOpen, hostReputation, spotsLeft } from "@/lib/logic";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { Portrait, inputClass } from "@/components/ui";

export default function HostDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state, api, me } = useViewer();
  const now = useNow();
  const [announce, setAnnounce] = useState("");
  const [question, setQuestion] = useState("");
  const [choices, setChoices] = useState("Yes\nNo");
  const [code, setCode] = useState("");
  if (!me) return null;
  const activity = state.activities.find((item) => item.id === params.id);
  if (!activity) return <main className="p-6">That gathering isn't here.</main>;
  if (activity.hostId !== me.id) return <main className="p-6">Only the host can manage this.</main>;
  const guests = state.rsvps.filter((item) => item.activityId === activity.id && item.status !== "cancelled");
  const waiting = state.waitlist.filter((item) => item.activityId === activity.id);
  const pulses = state.pulses.filter((item) => item.activityId === activity.id);
  const help = pulses.filter((item) => item.value === "help").length;
  const reviews = state.reviews.filter((item) => item.activityId === activity.id && !item.safetyConcern);
  const rep = hostReputation(me.id, state);
  const reports = state.reports.filter((item) => item.activityId === activity.id);
  const open = checkInOpen(activity, now);

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <Link href="/host" className="text-sm font-semibold text-muted">All hosting</Link>
      <h1 className="font-display mt-2 text-4xl leading-tight">{activity.title}</h1>
      <p className="mt-1 text-sm text-muted">{formatWhen(activity.startsAt).label} · {spotsLeft(activity, state.rsvps)} open of {activity.capacity}{activity.status === "cancelled" ? " · cancelled" : ""}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/activity/${activity.id}`} className="rounded-full bg-cream px-3 py-2 text-sm font-semibold">Guest view</Link>
        <Link href={`/activity/${activity.id}/live`} className="rounded-full bg-navy px-3 py-2 text-sm font-semibold text-white">Event mode</Link>
        <Link href={`/create?edit=${activity.id}`} className="rounded-full bg-cream px-3 py-2 text-sm font-semibold">Edit</Link>
        <button type="button" onClick={() => { const id = api.repeatActivity(activity.id); router.push(`/create?edit=${id}`); }} className="rounded-full bg-cream px-3 py-2 text-sm font-semibold">Repeat next week</button>
      </div>

      {help > 0 ? <p className="mt-4 rounded-2xl bg-[#fff0dc] px-3 py-3 text-sm font-semibold">{help} anonymous pulse {help === 1 ? "says" : "say"} a guest needs you. Names are not attached.</p> : null}

      <section className="mt-6">
        <h2 className="font-display text-2xl">People</h2>
        <ul className="mt-3 grid gap-2">
          {guests.map((rsvp) => {
            const user = state.users.find((item) => item.id === rsvp.userId);
            if (!user) return null;
            return (
              <li key={rsvp.id} className="flex flex-wrap items-center gap-3 rounded-3xl bg-cream p-3">
                <Portrait user={user} size={40} />
                <div className="min-w-0">
                  <p className="font-semibold">{user.name}</p>
                  <p className="text-xs text-muted">{rsvp.status}{rsvp.enRoute ? " · on the way" : ""} · code {checkInCode(activity.id, user.id)}</p>
                </div>
                {rsvp.status === "pending" ? (
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => api.approve(activity.id, user.id)} className="rounded-full bg-teal px-3 py-2 text-xs font-semibold text-white">Confirm</button>
                    <button type="button" onClick={() => api.decline(activity.id, user.id)} className="rounded-full bg-sand px-3 py-2 text-xs font-semibold">No place</button>
                  </div>
                ) : null}
                {rsvp.status === "going" && open ? <button type="button" onClick={() => api.hostCheckIn(activity.id, user.id)} className="ml-auto rounded-full bg-navy px-3 py-2 text-xs font-semibold text-white">Mark arrived</button> : null}
              </li>
            );
          })}
        </ul>
        {waiting.length > 0 ? <p className="mt-2 text-sm text-muted">Waitlist: {waiting.map((item) => state.users.find((user) => user.id === item.userId)?.name).filter(Boolean).join(", ")}</p> : null}
        {open ? (
          <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); api.checkInCode(activity.id, code); setCode(""); }}>
            <label className="sr-only" htmlFor="code">Arrival code</label>
            <input id="code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Arrival code" className={inputClass} />
            <button type="submit" className="rounded-full bg-coral px-4 font-semibold text-white">Confirm</button>
          </form>
        ) : null}
      </section>

      <section className="mt-6 grid gap-3">
        <form className="rounded-[1.4rem] bg-cream p-4" onSubmit={(event) => { event.preventDefault(); api.announce(activity.id, announce); setAnnounce(""); }}>
          <h2 className="font-display text-2xl">Announcement</h2>
          <textarea value={announce} onChange={(event) => setAnnounce(event.target.value)} className={`${inputClass} mt-2 min-h-20`} aria-label="Announcement" />
          <button type="submit" className="mt-2 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Send to the group</button>
        </form>
        <form className="rounded-[1.4rem] bg-cream p-4" onSubmit={(event) => { event.preventDefault(); api.createPoll(activity.id, question, choices.split("\n"), true); setQuestion(""); }}>
          <h2 className="font-display text-2xl">Live poll</h2>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} className={`${inputClass} mt-2`} placeholder="Question" aria-label="Poll question" />
          <textarea value={choices} onChange={(event) => setChoices(event.target.value)} className={`${inputClass} mt-2 min-h-20`} aria-label="Choices" />
          <button type="submit" className="mt-2 rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white">Open poll</button>
        </form>
      </section>

      <section className="mt-6 rounded-[1.4rem] bg-sand p-4 text-sm leading-6">
        <h2 className="font-display text-2xl">Private feedback</h2>
        {reviews.length === 0 ? <p className="mt-2">No private notes yet.</p> : (
          <>
            <p className="mt-2">Belonging {Math.round((reviews.reduce((sum, review) => sum + review.belonging, 0) / reviews.length) * 10) / 10} from {reviews.length} notes.{rep ? ` Your host mark across plans is ${rep.average}.` : ""}</p>
            <ul className="mt-2 grid gap-2">
              {reviews.map((review) => <li key={review.id} className="rounded-2xl bg-cream px-3 py-2">{review.note || "No written note."}</li>)}
            </ul>
          </>
        )}
        <p className="mt-3 text-muted">Pulse counts: {pulses.filter((item) => item.value === "great").length} great · {pulses.filter((item) => item.value === "okay").length} okay · {help} need help. Safety reports on this plan: {reports.length}.</p>
      </section>

      {activity.status !== "cancelled" ? (
        <button type="button" onClick={() => api.cancelActivity(activity.id)} className="mt-6 text-sm font-semibold text-coral-deep">Cancel gathering and tell everyone</button>
      ) : null}
    </main>
  );
}
