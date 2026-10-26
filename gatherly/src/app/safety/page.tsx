"use client";

import Link from "next/link";
import { GUIDELINES } from "@/lib/copy";
import { useViewer } from "@/components/shell";

export default function SafetyPage() {
  const { state, api, me } = useViewer();
  if (!me) return null;
  const reports = state.reports.filter((item) => item.reporterId === me.id);
  const blocks = state.blocks.filter((item) => item.userId === me.id);
  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="font-display text-4xl">Safety center</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Emergency help, the person you trust, and the reports you have already sent. Nothing here is a public score.</p>
      <div className="mt-5 grid gap-3">
        <a href="tel:999" className="rounded-[1.5rem] bg-navy px-4 py-4 font-semibold text-white">Call 999 · police and emergency in the UAE</a>
        <a href="tel:998" className="rounded-[1.5rem] bg-cream px-4 py-4 font-semibold">Call 998 · ambulance</a>
        {me.trustedContact ? (
          <a href={`tel:${me.trustedContact.phone}`} className="rounded-[1.5rem] bg-[#fff4ec] px-4 py-4">
            <span className="block font-semibold">Trusted contact · {me.trustedContact.name}</span>
            <span className="text-sm">{me.trustedContact.phone}</span>
          </a>
        ) : (
          <Link href="/settings" className="rounded-[1.5rem] bg-[#fff4ec] px-4 py-4 font-semibold">Add a trusted contact</Link>
        )}
      </div>
      <section className="mt-6">
        <h2 className="font-display text-2xl">Your reports</h2>
        <ul className="mt-2 grid gap-2">
          {reports.map((report) => (
            <li key={report.id} className="rounded-2xl bg-cream px-3 py-3 text-sm">
              <strong>{report.reason}</strong> · {report.status}
              <p className="text-muted">{report.details}</p>
            </li>
          ))}
        </ul>
        {reports.length === 0 ? <p className="mt-2 text-sm text-muted">You haven't filed a report.</p> : null}
      </section>
      <section className="mt-6">
        <h2 className="font-display text-2xl">Blocked</h2>
        <ul className="mt-2 grid gap-2">
          {blocks.map((block) => {
            const user = state.users.find((item) => item.id === block.blockedUserId);
            if (!user) return null;
            return (
              <li key={block.id} className="flex items-center justify-between rounded-2xl bg-cream px-3 py-3 text-sm">
                {user.name}
                <button type="button" onClick={() => api.unblock(user.id)} className="font-semibold">Unblock</button>
              </li>
            );
          })}
        </ul>
        {blocks.length === 0 ? <p className="mt-2 text-sm text-muted">No one is blocked.</p> : null}
      </section>
      <section className="mt-6">
        <h2 className="font-display text-2xl">How moderation works here</h2>
        <p className="mt-2 text-sm leading-6 text-muted">Reports sit in a queue a reviewer would see. This prototype keeps them on your device and does not publish them. Negative attendee reviews are not a public wall.</p>
        <ul className="mt-3 grid gap-2 text-sm leading-6">
          {GUIDELINES.map((item) => <li key={item} className="rounded-2xl bg-cream px-3 py-2">{item}</li>)}
        </ul>
      </section>
      <label className="mt-6 flex items-start gap-3 rounded-3xl bg-cream p-4 text-sm leading-6">
        <input type="checkbox" checked={me.includeWomenOnly} onChange={(event) => api.optWomenOnly(event.target.checked)} className="mt-1" />
        Include me in women-only gatherings. This is a self-attested choice, not a score, and it is not shown on your profile.
      </label>
    </main>
  );
}
