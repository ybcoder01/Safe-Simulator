"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { attendedTogether, activityView, mutualWith, requested, suggestedNext } from "@/lib/logic";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { ActivityCard } from "@/components/activity-card";
import { Cover, Portrait, inputClass } from "@/components/ui";

export default function AfterPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state, api, me, pref } = useViewer();
  const now = useNow();
  const [hostRating, setHostRating] = useState(5);
  const [eventRating, setEventRating] = useState(5);
  const [belonging, setBelonging] = useState(4);
  const [note, setNote] = useState("");
  const [safety, setSafety] = useState(false);
  if (!me || !pref) return null;
  const view = activityView(state, params.id, me, pref, now);
  if (!view) return <main className="p-6">That memory isn't here.</main>;
  const people = attendedTogether(state, view.activity.id).filter((user) => user.id !== me.id);
  const photos = state.media.filter((item) => item.activityId === view.activity.id);
  const existing = state.reviews.find((item) => item.activityId === view.activity.id && item.authorId === me.id);
  const next = suggestedNext(state, me, pref, now, view.activity.id);
  const highlights = state.promptAnswers.filter((answer) => state.prompts.some((prompt) => prompt.id === answer.promptId && prompt.activityId === view.activity.id)).slice(0, 3);

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <Link href={`/activity/${view.activity.id}`} className="text-sm font-semibold text-muted">Back</Link>
      <p className="mt-3 text-xs font-semibold tracking-[0.14em] text-teal uppercase">After</p>
      <h1 className="font-display text-4xl leading-tight">Thanks for showing up.</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Connections stay on your side of the screen until both people want them. A hard night goes to moderation, not onto someone's public profile.</p>

      {photos.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-2">
          {photos.map((photo) => (
            <figure key={photo.id} className="overflow-hidden rounded-3xl bg-cream">
              <div className="h-40"><Cover src={photo.src} alt={photo.caption} /></div>
              <figcaption className="px-3 py-2 text-xs text-muted">{photo.caption}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {highlights.length > 0 ? (
        <section className="mt-5">
          <h2 className="font-display text-2xl">From the room</h2>
          <ul className="mt-2 grid gap-2">
            {highlights.map((item) => {
              const user = state.users.find((person) => person.id === item.userId);
              return <li key={item.id} className="rounded-2xl bg-cream px-3 py-3 text-sm leading-6"><strong>{user?.name}: </strong>{item.body}</li>;
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="font-display text-2xl">Stay in touch</h2>
        <ul className="mt-3 grid gap-2">
          {people.map((person) => {
            const mutual = mutualWith(state, me.id, person.id);
            const mine = requested(state, me.id, person.id, view.activity.id);
            return (
              <li key={person.id} className="flex items-center gap-3 rounded-3xl bg-cream p-3">
                <Portrait user={person} size={48} />
                <div className="min-w-0">
                  <Link href={`/people/${person.id}`} className="font-semibold">{person.name}</Link>
                  <p className="text-xs text-muted">{mutual ? "Connected" : mine ? "Saved privately" : "Only you can see this choice"}</p>
                </div>
                {mutual ? (
                  <Link href={`/messages/${state.conversations.find((item) => item.kind === "direct" && item.memberIds.includes(me.id) && item.memberIds.includes(person.id))?.id ?? "/messages"}`} className="ml-auto rounded-full bg-navy px-3 py-2 text-sm font-semibold text-white">Message</Link>
                ) : (
                  <button type="button" disabled={mine} onClick={() => api.connect(person.id, view.activity.id)} className="ml-auto rounded-full bg-coral px-3 py-2 text-sm font-semibold text-white disabled:bg-line disabled:text-muted">
                    {mine ? "Saved" : "Stay in touch"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-6 rounded-[1.5rem] bg-cream p-4">
        <h2 className="font-display text-2xl">Private feedback</h2>
        {existing ? <p className="mt-2 text-sm text-muted">Already sent. The host sees a summary, not your name on a wall.</p> : (
          <form
            className="mt-3 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              api.feedback({ activityId: view.activity.id, hostRating, eventRating, belonging, note, safetyConcern: safety });
            }}
          >
            <Score label="Host" value={hostRating} onChange={setHostRating} />
            <Score label="The gathering" value={eventRating} onChange={setEventRating} />
            <Score label="I felt I belonged" value={belonging} onChange={setBelonging} />
            <label className="text-sm font-semibold" htmlFor="note">
              Note
              <textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} mt-1.5 min-h-20`} />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={safety} onChange={(event) => setSafety(event.target.checked)} />
              This includes a safety concern. Route it to moderation instead of the host summary.
            </label>
            <button type="submit" className="rounded-full bg-navy py-3 font-semibold text-white">Send privately</button>
          </form>
        )}
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            if (view.activity.hostId === me.id) {
              const id = api.repeatActivity(view.activity.id);
              router.push(`/create?edit=${id}`);
              return;
            }
            router.push(`/create?from=${view.activity.id}`);
          }}
          className="rounded-full bg-coral px-4 py-3 text-sm font-semibold text-white"
        >
          Plan a follow-up
        </button>
        <Link href="/profile" className="rounded-full bg-cream px-4 py-3 text-sm font-semibold">Open your journal</Link>
      </div>

      {next.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl">A possible next plan</h2>
          <div className="mt-3 grid gap-3">
            {next.map((item) => <ActivityCard key={item.activity.id} view={item} />)}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Score({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="mt-1 flex gap-1">
        {[1, 2, 3, 4, 5].map((score) => (
          <button key={score} type="button" aria-pressed={value === score} onClick={() => onChange(score)} className={`h-10 w-10 rounded-full text-sm font-semibold ${value === score ? "bg-navy text-white" : "bg-sand"}`}>
            {score}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
