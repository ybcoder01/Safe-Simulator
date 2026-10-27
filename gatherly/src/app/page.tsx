"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/components/store";
import { Cover, Portrait, inputClass } from "@/components/ui";

const DEMO_CODE = "246810";

export default function WelcomePage() {
  const { state, api } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [nextPath, setNextPath] = useState<string | null>(null);
  const maya = state.users.find((user) => user.id === "user_maya");

  useEffect(() => {
    if (!state.sessionUserId || !nextPath) return;
    const preference = state.preferences.find((item) => item.userId === state.sessionUserId);
    const destination = nextPath === "auto" ? (preference?.guidelinesAcceptedAt ? "/discover" : "/onboarding") : nextPath;
    router.replace(destination);
  }, [nextPath, router, state.preferences, state.sessionUserId]);

  useEffect(() => {
    if (nextPath || !state.sessionUserId) return;
    const preference = state.preferences.find((item) => item.userId === state.sessionUserId);
    if (preference?.guidelinesAcceptedAt) router.replace("/discover");
  }, [nextPath, router, state.preferences, state.sessionUserId]);

  function continueAsMaya() {
    setNextPath("/discover");
    api.signIn("user_maya");
  }

  function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!clean.includes("@")) {
      setError("Use a real email shape, even in this demo.");
      return;
    }
    setError("");
    setSent(true);
  }

  function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim() !== DEMO_CODE) {
      setError("The demo code is 246810.");
      return;
    }
    const clean = email.trim().toLowerCase();
    const existing = state.users.find((user) => user.email.toLowerCase() === clean);
    if (existing) {
      setNextPath("auto");
      api.signIn(existing.id);
      return;
    }
    sessionStorage.setItem("gatherly-new-email", clean);
    router.push("/onboarding");
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.1fr_0.9fr]">
      <div>
        <p className="text-sm font-semibold tracking-[0.16em] text-coral-deep uppercase">Dubai · small groups</p>
        <h1 className="font-display mt-3 text-5xl leading-[1.05] text-ink sm:text-6xl">Find your people by doing something together.</h1>
        <p className="mt-4 max-w-xl text-lg leading-8 text-muted">
          Gatherly is for coffee, walks, dinners, and the hour after. Not a feed, and not a dating app. The gathering is the point, and the room stays useful before, during, and after.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2">
          {["/images/coffee.jpg", "/images/marina.jpg", "/images/picnic.jpg"].map((src) => (
            <div key={src} className="h-28 overflow-hidden rounded-3xl sm:h-36">
              <Cover src={src} alt="" />
            </div>
          ))}
        </div>
      </div>
      <section className="rounded-[2rem] bg-cream p-5 shadow-[0_20px_60px_rgb(26_39_68_/_0.08)] sm:p-7">
        {maya ? (
          <button type="button" onClick={continueAsMaya} className="flex w-full items-center gap-3 rounded-3xl bg-sand p-3 text-left">
            <Portrait user={maya} size={56} />
            <span>
              <span className="block font-semibold">Continue as {maya.name}</span>
              <span className="block text-sm text-muted">Moved here six weeks ago. A sunset walk is already on her calendar.</span>
            </span>
          </button>
        ) : null}
        <div className="my-5 h-px bg-line" />
        {sent ? (
          <form onSubmit={submitCode} className="grid gap-3">
            <label className="text-sm font-semibold" htmlFor="code">
              Code for {email}
              <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} className={`${inputClass} mt-1.5 tracking-[0.3em]`} />
            </label>
            <p className="text-sm text-muted">Prototype only: the code is {DEMO_CODE}. Nothing is emailed.</p>
            {error ? <p className="text-sm text-coral-deep">{error}</p> : null}
            <button type="submit" className="rounded-full bg-navy px-4 py-3 font-semibold text-white">
              Verify and continue
            </button>
          </form>
        ) : (
          <form onSubmit={submitEmail} className="grid gap-3">
            <h2 className="font-display text-3xl">I'm new here</h2>
            <label className="text-sm font-semibold" htmlFor="email">
              Email
              <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={`${inputClass} mt-1.5`} />
            </label>
            {error ? <p className="text-sm text-coral-deep">{error}</p> : null}
            <button type="submit" className="rounded-full bg-coral px-4 py-3 font-semibold text-white">
              Email me a code
            </button>
            <p className="text-xs leading-5 text-muted">Use maya@gatherly.app to enter the seeded life, or any other email to build a fresh profile.</p>
          </form>
        )}
      </section>
    </main>
  );
}
