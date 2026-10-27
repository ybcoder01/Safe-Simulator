"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { phaseOf, reliability } from "@/lib/logic";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { Portrait, Sheet, inputClass } from "@/components/ui";

export default function PersonPage() {
  const params = useParams<{ id: string }>();
  const { state, api, me } = useViewer();
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("Safety");
  const [details, setDetails] = useState("");
  if (!me) return null;
  const person = state.users.find((user) => user.id === params.id);
  if (!person) return <main className="p-6">That person isn't here.</main>;
  const blocked = state.blocks.some((item) => item.userId === me.id && item.blockedUserId === person.id);
  const trust = reliability(person.id, state.rsvps);
  const upcoming = state.activities.filter((activity) => activity.hostId === person.id && activity.status !== "cancelled" && phaseOf(activity, now) !== "past" && activity.audience !== "private");

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <Link href="/discover" className="text-sm font-semibold text-muted">Back</Link>
      <div className="mt-4 flex items-center gap-4">
        <Portrait user={person} size={84} />
        <div>
          <h1 className="font-display text-4xl">{person.name}</h1>
          <p className="text-sm text-muted">{person.headline}</p>
          <p className="text-sm text-teal">{person.neighborhood} · {trust.label}</p>
        </div>
      </div>
      {blocked ? (
        <div className="mt-4 rounded-3xl bg-cream p-4 text-sm">
          You blocked {person.name}. They were not notified.
          <button type="button" onClick={() => api.unblock(person.id)} className="mt-3 block rounded-full bg-navy px-4 py-2 font-semibold text-white">Unblock</button>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {person.languages.map((language) => <span key={language} className="rounded-full bg-cream px-3 py-1 text-sm">{language}</span>)}
            {person.interests.map((interest) => <span key={interest} className="rounded-full bg-[#fff0dc] px-3 py-1 text-sm font-semibold">{interest}</span>)}
          </div>
          <ul className="mt-5 grid gap-2">
            {person.prompts.map((prompt) => (
              <li key={prompt.prompt} className="rounded-3xl bg-cream p-4">
                <p className="text-xs font-semibold text-muted">{prompt.prompt}</p>
                <p className="mt-1 text-sm leading-6">{prompt.answer}</p>
              </li>
            ))}
          </ul>
          <section className="mt-6">
            <h2 className="font-display text-2xl">Hosting soon</h2>
            <ul className="mt-2 grid gap-2">
              {upcoming.map((activity) => (
                <li key={activity.id}><Link href={`/activity/${activity.id}`} className="block rounded-2xl bg-cream px-3 py-3 text-sm font-semibold">{activity.title}</Link></li>
              ))}
            </ul>
            {upcoming.length === 0 ? <p className="mt-2 text-sm text-muted">No public plans on the calendar.</p> : null}
          </section>
          <div className="mt-6 flex gap-2">
            <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-cream px-4 py-2 text-sm font-semibold">Report</button>
            <button type="button" onClick={() => api.block(person.id)} className="rounded-full bg-cream px-4 py-2 text-sm font-semibold">Block</button>
          </div>
        </>
      )}
      <Sheet open={open} title={`Report ${person.name}`} onClose={() => setOpen(false)}>
        <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); api.report({ targetUserId: person.id, activityId: null, reason, details }); setOpen(false); }}>
          <label className="text-sm font-semibold" htmlFor="why">Reason<select id="why" value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} mt-1.5`}><option>Safety</option><option>Harassment</option><option>Spam</option></select></label>
          <label className="text-sm font-semibold" htmlFor="more">Details<textarea id="more" value={details} onChange={(event) => setDetails(event.target.value)} className={`${inputClass} mt-1.5 min-h-24`} /></label>
          <button type="submit" className="rounded-full bg-navy py-3 font-semibold text-white">Send to moderation</button>
        </form>
      </Sheet>
    </main>
  );
}
