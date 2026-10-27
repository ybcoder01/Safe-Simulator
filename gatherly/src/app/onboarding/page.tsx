"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ACCESS_OPTIONS, GUIDELINES, INTERESTS, LANGUAGES, NEIGHBORHOODS } from "@/lib/copy";
import { createId } from "@/lib/reducer";
import type { Energy, User, UserPreference } from "@/lib/types";
import { useViewer } from "@/components/shell";
import { inputClass } from "@/components/ui";

const ENERGIES: Energy[] = ["Relaxed", "Lively", "Focused"];

export default function OnboardingPage() {
  const { state, api, me } = useViewer();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [edit, setEdit] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [neighborhood, setNeighborhood] = useState(NEIGHBORHOODS[0]!.name);
  const [interests, setInterests] = useState<string[]>(["Coffee", "Walks"]);
  const [groupMin, setGroupMin] = useState(4);
  const [groupMax, setGroupMax] = useState(8);
  const [energy, setEnergy] = useState<Energy[]>(["Relaxed"]);
  const [languages, setLanguages] = useState<string[]>(["English"]);
  const [access, setAccess] = useState<string[]>([]);
  const [womenOnly, setWomenOnly] = useState(false);
  const [guidelines, setGuidelines] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editing = params.get("edit") === "1";
    setEdit(editing);
    const stored = sessionStorage.getItem("gatherly-new-email") ?? "";
    if (editing && me) {
      const pref = state.preferences.find((item) => item.userId === me.id);
      setEmail(me.email);
      setName(me.name);
      setNeighborhood(me.neighborhood);
      setInterests(me.interests);
      setLanguages(me.languages);
      setWomenOnly(me.includeWomenOnly);
      setGuidelines(true);
      if (pref) {
        setGroupMin(pref.groupMin);
        setGroupMax(pref.groupMax);
        setEnergy(pref.energy);
        setAccess(pref.accessibilityNeeds);
      }
      return;
    }
    if (!stored && !me) router.replace("/");
    setEmail(stored || me?.email || "");
  }, [me, router, state.preferences]);

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  function next() {
    if (step === 0 && name.trim().length < 2) return setError("Add the name people should use.");
    if (step === 1 && interests.length === 0) return setError("Pick at least one interest.");
    if (step === 2 && (groupMin > groupMax || energy.length === 0)) return setError("Set a group size and at least one pace.");
    if (step === 3 && languages.length === 0) return setError("Choose a language you can join in.");
    setError("");
    setStep((value) => value + 1);
  }

  function finish() {
    if (!guidelines) return setError("The guidelines are part of joining.");
    const spot = NEIGHBORHOODS.find((item) => item.name === neighborhood) ?? NEIGHBORHOODS[0]!;
    const existing = edit && me ? me : null;
    const user: User = {
      id: existing?.id ?? createId("user"),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: existing?.phone ?? "",
      city: "Dubai",
      neighborhood: spot.name,
      lat: spot.lat,
      lng: spot.lng,
      headline: existing?.headline ?? "New in the city, looking for small plans",
      avatarHue: existing?.avatarHue ?? Math.floor(Math.random() * 360),
      portrait: existing?.portrait ?? Math.floor(Math.random() * 8),
      languages,
      interests,
      emailVerified: true,
      phoneVerified: existing?.phoneVerified ?? false,
      identityVerified: existing?.identityVerified ?? false,
      identityStatus: existing?.identityStatus ?? "unverified",
      includeWomenOnly: womenOnly,
      memberSince: existing?.memberSince ?? new Date().toISOString(),
      prompts: existing?.prompts ?? [
        { prompt: "What made you join Gatherly?", answer: "I wanted plans that were small enough to become friends." },
      ],
      trustedContact: existing?.trustedContact ?? null,
    };
    const preference: UserPreference = {
      userId: user.id,
      groupMin,
      groupMax,
      energy,
      languages,
      accessibilityNeeds: access,
      prefersFree: false,
      maxPrice: 150,
      guidelinesAcceptedAt: new Date().toISOString(),
      reminderHours: 24,
    };
    api.completeOnboarding(user, preference);
    sessionStorage.removeItem("gatherly-new-email");
    router.push(edit ? "/settings" : "/discover");
  }

  const titles = ["What should we call you?", "What do you actually like doing?", "How big, and how loud?", "Which languages feel easy?", "Anything the host should plan for?", "A few agreements"];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-5 py-8">
      <p className="text-sm font-semibold text-coral-deep">Step {step + 1} of {titles.length}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full bg-coral" style={{ width: `${((step + 1) / titles.length) * 100}%` }} />
      </div>
      <h1 className="font-display mt-6 text-4xl leading-tight">{titles[step]}</h1>
      <div className="mt-6 grid gap-4">
        {step === 0 ? (
          <>
            <label className="text-sm font-semibold" htmlFor="name">
              Name
              <input id="name" value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-1.5`} />
            </label>
            <label className="text-sm font-semibold" htmlFor="area">
              Neighborhood
              <select id="area" value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)} className={`${inputClass} mt-1.5`}>
                {NEIGHBORHOODS.filter((item) => item.name !== "Hatta").map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <p className="text-sm text-muted">Signed in as {email || "a new email"}. Dubai is the city for this prototype.</p>
          </>
        ) : null}
        {step === 1 ? (
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((interest) => (
              <button key={interest} type="button" aria-pressed={interests.includes(interest)} onClick={() => toggle(interests, interest, setInterests)} className={`rounded-full px-3 py-2 text-sm font-semibold ${interests.includes(interest) ? "bg-navy text-white" : "bg-cream"}`}>
                {interest}
              </button>
            ))}
          </div>
        ) : null}
        {step === 2 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-semibold" htmlFor="min">
                Smallest group
                <input id="min" type="number" min={2} max={12} value={groupMin} onChange={(event) => setGroupMin(Number(event.target.value))} className={`${inputClass} mt-1.5`} />
              </label>
              <label className="text-sm font-semibold" htmlFor="max">
                Largest group
                <input id="max" type="number" min={2} max={16} value={groupMax} onChange={(event) => setGroupMax(Number(event.target.value))} className={`${inputClass} mt-1.5`} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {ENERGIES.map((item) => (
                <button key={item} type="button" aria-pressed={energy.includes(item)} onClick={() => toggle(energy, item, (next) => setEnergy(next as Energy[]))} className={`rounded-full px-3 py-2 text-sm font-semibold ${energy.includes(item) ? "bg-coral text-white" : "bg-cream"}`}>
                  {item}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {step === 3 ? (
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((language) => (
              <button key={language} type="button" aria-pressed={languages.includes(language)} onClick={() => toggle(languages, language, setLanguages)} className={`rounded-full px-3 py-2 text-sm font-semibold ${languages.includes(language) ? "bg-navy text-white" : "bg-cream"}`}>
                {language}
              </button>
            ))}
          </div>
        ) : null}
        {step === 4 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {ACCESS_OPTIONS.map((item) => (
                <button key={item} type="button" aria-pressed={access.includes(item)} onClick={() => toggle(access, item, setAccess)} className={`rounded-full px-3 py-2 text-sm font-semibold ${access.includes(item) ? "bg-teal text-white" : "bg-cream"}`}>
                  {item}
                </button>
              ))}
            </div>
            <p className="text-sm leading-6 text-muted">Skip this if nothing applies. It changes recommendations. It is never shown as a public score.</p>
          </>
        ) : null}
        {step === 5 ? (
          <>
            <label className="flex items-start gap-3 rounded-2xl bg-cream p-3 text-sm leading-6">
              <input type="checkbox" checked={womenOnly} onChange={(event) => setWomenOnly(event.target.checked)} className="mt-1" />
              Include women-only gatherings. Turn this on if that includes you. Gatherly does not score or publish the choice.
            </label>
            <ul className="grid gap-2 text-sm leading-6">
              {GUIDELINES.map((item) => (
                <li key={item} className="rounded-2xl bg-cream px-3 py-2">{item}</li>
              ))}
            </ul>
            <label className="flex items-start gap-3 text-sm font-semibold">
              <input type="checkbox" checked={guidelines} onChange={(event) => setGuidelines(event.target.checked)} className="mt-1" />
              I'll keep gatherings small, cancellable, and kind.
            </label>
          </>
        ) : null}
        {error ? <p className="text-sm text-coral-deep">{error}</p> : null}
      </div>
      <div className="mt-auto flex gap-3 pt-8">
        {step > 0 ? (
          <button type="button" onClick={() => setStep((value) => value - 1)} className="rounded-full px-4 py-3 font-semibold">
            Back
          </button>
        ) : null}
        {step < titles.length - 1 ? (
          <button type="button" onClick={next} className="ml-auto rounded-full bg-navy px-5 py-3 font-semibold text-white">
            Continue
          </button>
        ) : (
          <button type="button" onClick={finish} className="ml-auto rounded-full bg-coral px-5 py-3 font-semibold text-white">
            {edit ? "Save preferences" : "See what's nearby"}
          </button>
        )}
      </div>
    </main>
  );
}
