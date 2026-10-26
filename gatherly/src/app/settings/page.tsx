"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useViewer } from "@/components/shell";
import { inputClass } from "@/components/ui";

export default function SettingsPage() {
  const { api, me, pref } = useViewer();
  const router = useRouter();
  const [name, setName] = useState(me?.trustedContact?.name ?? "");
  const [phone, setPhone] = useState(me?.trustedContact?.phone ?? "");
  const [phoneCode, setPhoneCode] = useState("");
  if (!me || !pref) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="font-display text-4xl">Settings</h1>
      <section className="mt-4 rounded-[1.5rem] bg-cream p-4 text-sm leading-6">
        <p className="font-semibold">{me.name}</p>
        <p className="text-muted">{me.email}</p>
        <p className="mt-2">Email verified. Phone {me.phoneVerified ? "verified" : "not verified"}. Identity {me.identityStatus}.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => api.verification("phone", "pending")} className="rounded-full bg-sand px-3 py-2 font-semibold">Submit phone</button>
          {phoneCode === "246810" ? null : (
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (phoneCode.trim() === "246810") api.verification("phone", "verified"); }}>
              <label className="sr-only" htmlFor="pcode">Phone code</label>
              <input id="pcode" value={phoneCode} onChange={(event) => setPhoneCode(event.target.value)} placeholder="Phone code" className={`${inputClass} w-32`} />
              <button type="submit" className="rounded-full bg-navy px-3 font-semibold text-white">Verify</button>
            </form>
          )}
          <button type="button" onClick={() => api.verification("identity", "pending")} className="rounded-full bg-sand px-3 py-2 font-semibold">Submit identity</button>
          <button type="button" onClick={() => api.verification("identity", "verified")} className="rounded-full bg-sand px-3 py-2 font-semibold">Demo: mark identity verified</button>
        </div>
        <p className="mt-2 text-xs text-muted">Phone demo code is 246810. Identity review would be a person. The demo button only previews the badge.</p>
      </section>

      <section className="mt-4 grid gap-3">
        <Link href="/onboarding?edit=1" className="rounded-3xl bg-cream px-4 py-4 font-semibold">Edit interests, pace, and access needs</Link>
        <label className="flex items-center justify-between rounded-3xl bg-cream px-4 py-4 text-sm font-semibold">
          Remind me 24 hours before
          <input
            type="checkbox"
            checked={pref.reminderHours === 24}
            onChange={(event) => api.updatePreference({ ...pref, reminderHours: event.target.checked ? 24 : null })}
          />
        </label>
        <label className="flex items-center justify-between rounded-3xl bg-cream px-4 py-4 text-sm font-semibold">
          Women-only gatherings
          <input type="checkbox" checked={me.includeWomenOnly} onChange={(event) => api.optWomenOnly(event.target.checked)} />
        </label>
      </section>

      <form
        className="mt-4 grid gap-2 rounded-[1.5rem] bg-cream p-4"
        onSubmit={(event) => {
          event.preventDefault();
          api.trustedContact(name, phone);
        }}
      >
        <h2 className="font-display text-2xl">Trusted contact</h2>
        <label className="text-sm font-semibold" htmlFor="tc-name">Name<input id="tc-name" value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-semibold" htmlFor="tc-phone">Phone<input id="tc-phone" value={phone} onChange={(event) => setPhone(event.target.value)} className={`${inputClass} mt-1.5`} /></label>
        <button type="submit" className="justify-self-start rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Save contact</button>
      </form>

      <div className="mt-6 flex flex-wrap gap-2">
        <button type="button" onClick={() => { api.signOut(); router.push("/"); }} className="rounded-full bg-cream px-4 py-3 text-sm font-semibold">Sign out</button>
        <button type="button" onClick={() => { api.reset(); router.push("/"); }} className="rounded-full bg-sand px-4 py-3 text-sm font-semibold">Reset demo data</button>
      </div>
    </main>
  );
}
