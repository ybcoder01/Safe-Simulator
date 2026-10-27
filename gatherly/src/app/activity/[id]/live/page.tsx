"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { BINGO, CONVERSATION_CARDS, MISSIONS } from "@/lib/copy";
import { checkInCode } from "@/lib/format";
import { activityView, checkInOpen } from "@/lib/logic";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { Icon, Sheet } from "@/components/ui";

export default function LivePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state, api, me, pref } = useViewer();
  const now = useNow();
  const [level, setLevel] = useState<"light" | "medium" | "deeper">("light");
  const [card, setCard] = useState(0);
  const [seconds, setSeconds] = useState(8 * 60);
  const [running, setRunning] = useState(false);
  const [safety, setSafety] = useState(false);
  const [svg, setSvg] = useState("");
  const view = me && pref ? activityView(state, params.id, me, pref, now) : null;
  const code = view && me ? checkInCode(view.activity.id, me.id) : "";
  const payload = view && me ? `gatherly://checkin/${view.activity.id}/${me.id}/${code}` : "";

  useEffect(() => {
    if (!payload) return;
    let cancel = false;
    void QRCode.toString(payload, { type: "svg", margin: 1, color: { dark: "#1a2744", light: "#fffdf9" } }).then((markup) => {
      if (!cancel) setSvg(markup);
    });
    return () => {
      cancel = true;
    };
  }, [payload]);

  useEffect(() => {
    if (!me) router.replace("/");
  }, [me, router]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setSeconds((value) => (value > 0 ? value - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  if (!me || !pref) return null;
  if (!view) return <main className="p-6">This gathering isn't here.</main>;
  const open = checkInOpen(view.activity, now);
  const here = view.myRsvp?.status === "checked-in";
  const sharing = state.locationShares.some((item) => item.activityId === view.activity.id && item.userId === me.id && item.active);
  const polls = state.polls.filter((item) => item.activityId === view.activity.id && item.live);
  const marks = state.gameMarks.filter((item) => item.activityId === view.activity.id && item.userId === me.id);
  const bingoCount = marks.filter((item) => item.kind === "bingo").length;
  const deck = CONVERSATION_CARDS[level];
  const prompt = deck[card % deck.length] ?? deck[0];
  const minute = String(Math.floor(seconds / 60)).padStart(2, "0");
  const second = String(seconds % 60).padStart(2, "0");

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-sand px-4 py-5">
      <div className="flex items-center justify-between">
        <Link href={`/activity/${view.activity.id}`} className="text-sm font-semibold">Leave event mode</Link>
        <button type="button" onClick={() => setSafety(true)} className="grid h-11 w-11 place-items-center rounded-full bg-cream" aria-label="Safety">
          <Icon name="shield" />
        </button>
      </div>
      <p className="mt-4 text-xs font-semibold tracking-[0.16em] text-coral-deep uppercase">During · optional</p>
      <h1 className="font-display text-4xl leading-tight">{view.activity.title}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">Use a card if the table goes quiet. Put the phone down once people are talking.</p>

      <section className="mt-5 rounded-[1.8rem] bg-cream p-4">
        <h2 className="font-display text-3xl">{here ? "You're here" : "Check in"}</h2>
        <p className="mt-1 text-sm text-muted">Show {code} or tap when you arrive. Your host can confirm it.</p>
        {svg ? <div className="mx-auto mt-3 max-w-[14rem]" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
        <p className="text-center font-display text-4xl tracking-[0.2em]">{code}</p>
        <button type="button" disabled={!open || here} onClick={() => api.checkIn(view.activity.id)} className="mt-3 w-full rounded-full bg-coral py-4 text-lg font-semibold text-white disabled:bg-line disabled:text-muted">
          {here ? "Checked in" : open ? "I'm here" : "Check-in opens near the start"}
        </button>
        {view.activity.modules.locationShare ? (
          <button type="button" onClick={() => api.shareLocation(view.activity.id, !sharing)} className="mt-2 w-full rounded-full bg-sand py-3 text-sm font-semibold">
            {sharing ? "Stop sharing my approximate area" : "Share approximate area with the group"}
          </button>
        ) : null}
      </section>

      <section className="mt-4 rounded-[1.8rem] bg-navy p-5 text-white">
        <div className="flex gap-2">
          {(["light", "medium", "deeper"] as const).map((item) => (
            <button key={item} type="button" onClick={() => { setLevel(item); setCard(0); }} className={`rounded-full px-3 py-1 text-sm font-semibold ${level === item ? "bg-white text-navy" : "bg-white/10"}`}>
              {item}
            </button>
          ))}
        </div>
        <p className="font-display mt-6 min-h-28 text-3xl leading-tight">{prompt}</p>
        <button type="button" onClick={() => setCard((value) => value + 1)} className="mt-4 rounded-full bg-coral px-4 py-3 font-semibold">
          Another card
        </button>
      </section>

      <section className="mt-4 rounded-[1.8rem] bg-cream p-4 text-center">
        <p className="text-sm font-semibold text-muted">Pair timer</p>
        <p className="font-display text-6xl">{minute}:{second}</p>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" onClick={() => setRunning((value) => !value)} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">{running ? "Pause" : "Start"}</button>
          <button type="button" onClick={() => { setRunning(false); setSeconds(8 * 60); }} className="rounded-full bg-sand px-4 py-2 text-sm font-semibold">Reset</button>
        </div>
      </section>

      <section className="mt-4">
        <h2 className="font-display text-2xl">Find someone who…</h2>
        <p className="text-sm text-muted">{bingoCount >= 3 ? "Three is plenty for one evening." : "Three marks is a full game."}</p>
        <ul className="mt-2 grid gap-2">
          {BINGO.map((item) => {
            const on = marks.some((mark) => mark.kind === "bingo" && mark.itemId === item.id);
            return (
              <li key={item.id}>
                <button type="button" aria-pressed={on} onClick={() => api.toggleMark(view.activity.id, "bingo", item.id)} className={`w-full rounded-2xl px-3 py-3 text-left text-sm ${on ? "bg-teal text-white" : "bg-cream"}`}>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-4">
        <h2 className="font-display text-2xl">Missions</h2>
        <ul className="mt-2 grid gap-2">
          {MISSIONS.map((item) => {
            const on = marks.some((mark) => mark.kind === "mission" && mark.itemId === item.id);
            return (
              <li key={item.id}>
                <button type="button" aria-pressed={on} onClick={() => api.toggleMark(view.activity.id, "mission", item.id)} className={`w-full rounded-2xl px-3 py-3 text-left text-sm ${on ? "bg-[#fff0dc]" : "bg-cream"}`}>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {polls.map((poll) => {
        const choices = state.pollOptions.filter((item) => item.pollId === poll.id);
        return (
          <section key={poll.id} className="mt-4 rounded-[1.4rem] bg-cream p-4">
            <h2 className="font-display text-2xl">Live vote · {poll.question}</h2>
            <div className="mt-3 grid gap-2">
              {choices.map((choice) => (
                <button key={choice.id} type="button" onClick={() => api.vote(poll.id, choice.id)} className="rounded-2xl bg-sand px-3 py-3 text-left text-sm font-semibold">
                  {choice.label}
                  <span className="ml-2 text-muted">{state.pollVotes.filter((item) => item.optionId === choice.id).length}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <section className="mt-4 grid grid-cols-3 gap-2">
        {(["great", "okay", "help"] as const).map((value) => (
          <button key={value} type="button" onClick={() => api.pulse(view.activity.id, value)} className="rounded-3xl bg-cream px-2 py-4 text-sm font-semibold">
            {value === "great" ? "Great" : value === "okay" ? "Okay" : "Need host"}
          </button>
        ))}
      </section>
      <p className="mt-2 text-center text-xs text-muted">The pulse is anonymous. Only a call for help wakes the host.</p>

      <Sheet open={safety} title="Safety" onClose={() => setSafety(false)}>
        <div className="grid gap-3 text-sm leading-6">
          <a href="tel:999" className="rounded-2xl bg-navy px-4 py-3 font-semibold text-white">Call 999 · UAE emergency</a>
          {me.trustedContact ? <a href={`tel:${me.trustedContact.phone}`} className="rounded-2xl bg-cream px-4 py-3 font-semibold">Call {me.trustedContact.name}</a> : <Link href="/safety" className="rounded-2xl bg-cream px-4 py-3 font-semibold">Add a trusted contact</Link>}
          <Link href="/safety" className="rounded-2xl bg-cream px-4 py-3 font-semibold">Report or block</Link>
          <p className="text-muted">Leaving the gathering is allowed at any point. You don't owe the room an explanation.</p>
        </div>
      </Sheet>
    </main>
  );
}
