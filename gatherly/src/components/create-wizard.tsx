"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ACCESS_OPTIONS, COVER_PRESETS, LANGUAGES, NEIGHBORHOODS, TEMPLATES, neighborhood } from "@/lib/copy";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/format";
import type { ActivityDraft, ActivityModules, Audience, Energy, Experience } from "@/lib/types";
import { useViewer } from "./shell";
import { Cover, inputClass } from "./ui";

const STEPS = ["Type", "Title", "When", "Size", "Vibe", "Price", "Who", "Tools", "Preview"];

const EMPTY_MODULES: ActivityModules = {
  chat: true,
  prompts: true,
  polls: true,
  board: true,
  icebreakers: true,
  liveGame: true,
  locationShare: false,
};

function blank(): ActivityDraft {
  const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  return {
    communityId: null,
    title: "",
    description: "",
    type: "Coffee",
    cover: "/images/coffee.jpg",
    neighborhood: "Dubai Marina",
    placeName: "",
    exactAddress: "",
    startsAt: start.toISOString(),
    durationMin: 90,
    capacity: 6,
    price: 0,
    energy: "Relaxed",
    languages: ["English"],
    accessibility: ["Step-free"],
    experience: "Newcomer-friendly",
    audience: "public",
    tags: ["Coffee"],
    modules: EMPTY_MODULES,
  };
}

export function CreateWizard() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, api, me } = useViewer();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ActivityDraft>(blank);
  const [loaded, setLoaded] = useState(false);
  const editId = params.get("edit");
  const fromId = params.get("from");

  useEffect(() => {
    if (loaded) return;
    const sourceId = editId || fromId;
    if (!sourceId) {
      setLoaded(true);
      return;
    }
    const activity = state.activities.find((item) => item.id === sourceId);
    const venue = state.venues.find((item) => item.id === activity?.venueId);
    if (!activity || !venue) return;
    setDraft({
      communityId: activity.communityId,
      title: fromId ? `Follow-up: ${activity.title}` : activity.title,
      description: activity.description,
      type: activity.type,
      cover: activity.cover,
      neighborhood: venue.neighborhood,
      placeName: venue.name,
      exactAddress: activity.audience === "public" ? venue.exactAddress : "",
      startsAt: fromId ? new Date(new Date(activity.startsAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : activity.startsAt,
      durationMin: activity.durationMin,
      capacity: activity.capacity,
      price: activity.price,
      energy: activity.energy,
      languages: activity.languages,
      accessibility: activity.accessibility,
      experience: activity.experience,
      audience: activity.audience,
      tags: activity.tags,
      modules: activity.modules,
    });
    setLoaded(true);
  }, [editId, fromId, loaded, state.activities, state.venues]);

  if (!me) return null;
  const patch = (partial: Partial<ActivityDraft>) => setDraft((current) => ({ ...current, ...partial }));

  function publish() {
    if (draft.title.trim().length < 4) return;
    if (editId && state.activities.some((item) => item.id === editId && item.hostId === me?.id)) {
      const spot = neighborhood(draft.neighborhood);
      api.updateActivity(
        editId,
        {
          title: draft.title.trim(),
          description: draft.description.trim(),
          type: draft.type,
          cover: draft.cover,
          startsAt: draft.startsAt,
          durationMin: draft.durationMin,
          capacity: draft.capacity,
          price: draft.price,
          energy: draft.energy,
          languages: draft.languages,
          accessibility: draft.accessibility,
          experience: draft.experience,
          audience: draft.audience,
          tags: draft.tags,
          modules: draft.modules,
        },
        {
          name: draft.placeName.trim() || spot.name,
          neighborhood: spot.name,
          city: "Dubai",
          areaLat: spot.lat,
          areaLng: spot.lng,
          exactLat: spot.lat + 0.0014,
          exactLng: spot.lng + 0.0011,
          exactAddress: draft.exactAddress.trim() || `${spot.name}, exact point shared after you join`,
          meetingNote: "The host will be easy to spot.",
        },
      );
      router.push(`/activity/${editId}`);
      return;
    }
    const id = api.createActivity(draft);
    router.push(`/activity/${id}`);
  }

  async function onFile(file: File) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1200 / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    patch({ cover: canvas.toDataURL("image/jpeg", 0.72) });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6">
      <p className="text-sm font-semibold text-coral-deep">{editId ? "Edit gathering" : "New gathering"} · {step + 1} of {STEPS.length}</p>
      <div className="mt-2 h-1.5 rounded-full bg-line"><div className="h-1.5 rounded-full bg-coral" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
      <h1 className="font-display mt-5 text-4xl">{STEPS[step]}</h1>
      <div className="mt-5 grid gap-4">
        {step === 0 ? (
          <div className="grid gap-2">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => {
                  patch({
                    type: template.type,
                    title: draft.title || template.title,
                    description: draft.description || template.description,
                    energy: template.energy,
                    capacity: template.capacity,
                    durationMin: template.durationMin,
                    price: template.price,
                    experience: template.experience,
                    tags: template.tags,
                    cover: template.cover,
                  });
                  setStep(1);
                }}
                className="rounded-3xl bg-cream px-4 py-3 text-left"
              >
                <span className="font-semibold">{template.name}</span>
                <span className="mt-1 block text-sm text-muted">{template.description}</span>
              </button>
            ))}
          </div>
        ) : null}
        {step === 1 ? (
          <>
            <label className="text-sm font-semibold" htmlFor="title">Title<input id="title" value={draft.title} onChange={(event) => patch({ title: event.target.value })} className={`${inputClass} mt-1.5`} /></label>
            <label className="text-sm font-semibold" htmlFor="about">What will you actually do?<textarea id="about" value={draft.description} onChange={(event) => patch({ description: event.target.value })} className={`${inputClass} mt-1.5 min-h-28`} /></label>
            <div className="grid grid-cols-4 gap-2">
              {COVER_PRESETS.map((cover) => (
                <button key={cover.src} type="button" onClick={() => patch({ cover: cover.src })} className={`h-16 overflow-hidden rounded-2xl ${draft.cover === cover.src ? "ring-2 ring-coral" : ""}`} aria-label={cover.label}>
                  <Cover src={cover.src} alt="" />
                </button>
              ))}
            </div>
            <label className="text-sm font-semibold">
              Or upload a cover
              <input type="file" accept="image/*" className="mt-1.5 block text-sm" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onFile(file); }} />
            </label>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <label className="text-sm font-semibold" htmlFor="area">Neighborhood<select id="area" value={draft.neighborhood} onChange={(event) => patch({ neighborhood: event.target.value })} className={`${inputClass} mt-1.5`}>{NEIGHBORHOODS.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>
            <label className="text-sm font-semibold" htmlFor="place">Place name<input id="place" value={draft.placeName} onChange={(event) => patch({ placeName: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="A cafe, a park gate, a studio" /></label>
            <label className="text-sm font-semibold" htmlFor="address">Exact address<input id="address" value={draft.exactAddress} onChange={(event) => patch({ exactAddress: event.target.value })} className={`${inputClass} mt-1.5`} placeholder="Hidden until someone is confirmed, if the plan is private" /></label>
            <label className="text-sm font-semibold" htmlFor="when">Start, Dubai time<input id="when" type="datetime-local" value={toDatetimeLocal(draft.startsAt)} onChange={(event) => patch({ startsAt: fromDatetimeLocal(event.target.value) })} className={`${inputClass} mt-1.5`} /></label>
            <label className="text-sm font-semibold" htmlFor="duration">Duration in minutes<input id="duration" type="number" min={30} max={480} value={draft.durationMin} onChange={(event) => patch({ durationMin: Number(event.target.value) })} className={`${inputClass} mt-1.5`} /></label>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <label className="text-sm font-semibold" htmlFor="cap">Places, including you<input id="cap" type="number" min={2} max={16} value={draft.capacity} onChange={(event) => patch({ capacity: Number(event.target.value) })} className={`${inputClass} mt-1.5`} /></label>
            <p className="text-sm leading-6 text-muted">{draft.capacity >= 4 && draft.capacity <= 10 ? "A group of 4–10 is small enough to learn names." : "4–10 tends to work better. You can still publish outside that."}</p>
          </>
        ) : null}
        {step === 4 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {(["Relaxed", "Lively", "Focused"] as Energy[]).map((energy) => (
                <button key={energy} type="button" onClick={() => patch({ energy })} className={`rounded-full px-3 py-2 text-sm font-semibold ${draft.energy === energy ? "bg-coral text-white" : "bg-cream"}`}>{energy}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((language) => {
                const on = draft.languages.includes(language);
                return <button key={language} type="button" onClick={() => patch({ languages: on ? draft.languages.filter((item) => item !== language) : [...draft.languages, language] })} className={`rounded-full px-3 py-2 text-sm font-semibold ${on ? "bg-navy text-white" : "bg-cream"}`}>{language}</button>;
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCESS_OPTIONS.map((item) => {
                const on = draft.accessibility.includes(item);
                return <button key={item} type="button" onClick={() => patch({ accessibility: on ? draft.accessibility.filter((entry) => entry !== item) : [...draft.accessibility, item] })} className={`rounded-full px-3 py-2 text-sm font-semibold ${on ? "bg-teal text-white" : "bg-cream"}`}>{item}</button>;
              })}
            </div>
            <label className="text-sm font-semibold" htmlFor="exp">Experience<select id="exp" value={draft.experience} onChange={(event) => patch({ experience: event.target.value as Experience })} className={`${inputClass} mt-1.5`}><option>Newcomer-friendly</option><option>Some experience</option><option>Bring your thing</option></select></label>
          </>
        ) : null}
        {step === 5 ? (
          <label className="text-sm font-semibold" htmlFor="price">
            Price in AED, 0 if free
            <input id="price" type="number" min={0} value={draft.price} onChange={(event) => patch({ price: Number(event.target.value) })} className={`${inputClass} mt-1.5`} />
          </label>
        ) : null}
        {step === 6 ? (
          <div className="grid gap-2">
            {([
              ["public", "Public", "Anyone nearby can join. The meeting point is visible."],
              ["approval", "Host confirms", "You approve each person. The door stays hidden until then."],
              ["private", "Private", "Only people you invite can see it."],
              ["women-only", "Women-only", "Visible to everyone, joinable by people who opt in."],
            ] as [Audience, string, string][]).map(([value, label, copy]) => (
              <button key={value} type="button" onClick={() => patch({ audience: value })} className={`rounded-3xl px-4 py-3 text-left ${draft.audience === value ? "bg-navy text-white" : "bg-cream"}`}>
                <span className="font-semibold">{label}</span>
                <span className={`mt-1 block text-sm ${draft.audience === value ? "text-white/80" : "text-muted"}`}>{copy}</span>
              </button>
            ))}
          </div>
        ) : null}
        {step === 7 ? (
          <div className="grid gap-2">
            {(
              [
                ["chat", "Group chat"],
                ["prompts", "Prompt cards"],
                ["polls", "Polls"],
                ["board", "Suggestion board"],
                ["icebreakers", "Host icebreakers"],
                ["liveGame", "Live conversation cards"],
                ["locationShare", "Optional location sharing"],
              ] as [keyof ActivityModules, string][]
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-2xl bg-cream px-3 py-3 text-sm font-semibold">
                {label}
                <input type="checkbox" checked={draft.modules[key]} onChange={(event) => patch({ modules: { ...draft.modules, [key]: event.target.checked } })} />
              </label>
            ))}
          </div>
        ) : null}
        {step === 8 ? (
          <article className="overflow-hidden rounded-[1.6rem] bg-cream">
            <div className="h-44"><Cover src={draft.cover} alt="" /></div>
            <div className="p-4">
              <h2 className="font-display text-3xl">{draft.title || "Untitled"}</h2>
              <p className="mt-2 text-sm leading-6">{draft.description}</p>
              <p className="mt-2 text-sm text-muted">{draft.neighborhood} · {draft.capacity} people · {draft.price ? `AED ${draft.price}` : "Free"} · {draft.audience}</p>
            </div>
          </article>
        ) : null}
      </div>
      <div className="mt-auto flex gap-3 pt-8">
        {step > 0 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="rounded-full px-4 py-3 font-semibold">Back</button> : null}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep((value) => value + 1)} className="ml-auto rounded-full bg-navy px-5 py-3 font-semibold text-white">Continue</button>
        ) : (
          <button type="button" onClick={publish} className="ml-auto rounded-full bg-coral px-5 py-3 font-semibold text-white">Publish</button>
        )}
      </div>
    </main>
  );
}
