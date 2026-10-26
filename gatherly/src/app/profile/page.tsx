"use client";

import Link from "next/link";
import { formatWhen } from "@/lib/format";
import { journal, peopleMet, phaseOf, reliability } from "@/lib/logic";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { Cover, EmptyArt, Portrait } from "@/components/ui";

export default function ProfilePage() {
  const { state, me } = useViewer();
  const now = useNow();
  if (!me) return null;
  const trust = reliability(me.id, state.rsvps);
  const people = peopleMet(state, me.id);
  const memories = journal(state, me.id, now);
  const saved = state.saved.filter((item) => item.userId === me.id).map((item) => state.activities.find((activity) => activity.id === item.activityId)).filter((item) => item != null);
  const hosting = state.activities.filter((activity) => activity.hostId === me.id && activity.status !== "cancelled" && phaseOf(activity, now) !== "past");

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <div className="flex items-center gap-4">
        <Portrait user={me} size={84} />
        <div>
          <h1 className="font-display text-4xl">{me.name}</h1>
          <p className="text-sm text-muted">{me.headline}</p>
          <p className="text-sm text-teal">{me.neighborhood} · {trust.label}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {me.emailVerified ? <span className="rounded-full bg-cream px-3 py-1">Email verified</span> : null}
        {me.phoneVerified ? <span className="rounded-full bg-cream px-3 py-1">Phone verified</span> : null}
        {me.identityVerified ? <span className="rounded-full bg-teal px-3 py-1 text-white">Identity verified</span> : <span className="rounded-full bg-cream px-3 py-1">Identity not reviewed</span>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {me.interests.map((interest) => <span key={interest} className="rounded-full bg-[#fff0dc] px-3 py-1 text-sm font-semibold">{interest}</span>)}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
        <Link href="/host" className="rounded-3xl bg-navy px-4 py-4 font-semibold text-white">Host dashboard</Link>
        <Link href="/safety" className="rounded-3xl bg-cream px-4 py-4 font-semibold">Safety center</Link>
        <Link href="/settings" className="rounded-3xl bg-cream px-4 py-4 font-semibold">Settings</Link>
        <Link href="/notifications" className="rounded-3xl bg-cream px-4 py-4 font-semibold">Notices</Link>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-2xl">People you met</h2>
        {people.length === 0 ? <p className="mt-2 text-sm text-muted">Mutual connections show up here. One-way wishes stay private.</p> : (
          <ul className="mt-3 flex gap-3 overflow-x-auto">
            {people.map((person) => (
              <li key={person.id}>
                <Link href={`/people/${person.id}`} className="block w-24 text-center">
                  <Portrait user={person} size={64} />
                  <span className="mt-1 block text-xs font-semibold">{person.name.split(" ")[0]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl">Hosting</h2>
        <ul className="mt-3 grid gap-2">
          {hosting.map((activity) => (
            <li key={activity.id}><Link href={`/host/${activity.id}`} className="block rounded-2xl bg-cream px-3 py-3 text-sm font-semibold">{activity.title}</Link></li>
          ))}
        </ul>
        {hosting.length === 0 ? <p className="mt-2 text-sm text-muted">You aren't hosting anything upcoming.</p> : null}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl">Social journal</h2>
        <div className="mt-3 grid gap-3">
          {memories.map((activity) => (
            <Link key={activity.id} href={`/activity/${activity.id}/after`} className="grid grid-cols-[7rem_1fr] overflow-hidden rounded-3xl bg-cream">
              <div className="h-28"><Cover src={activity.cover} alt="" /></div>
              <div className="p-3">
                <p className="font-semibold">{activity.title}</p>
                <p className="text-xs text-muted">{formatWhen(activity.startsAt).label}</p>
              </div>
            </Link>
          ))}
        </div>
        {memories.length === 0 ? <div className="mt-3"><EmptyArt title="No memories yet" body="Attended gatherings land here, with the photos and the people you chose to keep." /></div> : null}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl">Saved</h2>
        <ul className="mt-3 grid gap-2">
          {saved.map((activity) => (
            <li key={activity.id}><Link href={`/activity/${activity.id}`} className="block rounded-2xl bg-cream px-3 py-3 text-sm">{activity.title}</Link></li>
          ))}
        </ul>
      </section>
    </main>
  );
}
