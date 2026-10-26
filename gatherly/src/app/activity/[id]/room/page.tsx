"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { countdown, formatWhen } from "@/lib/format";
import { activityView, icebreakers } from "@/lib/logic";
import { Thread } from "@/components/thread";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { Portrait, inputClass } from "@/components/ui";

const TABS = ["Chat", "Prompts", "Polls", "Board", "Plan"] as const;

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const { state, api, me, pref } = useViewer();
  const now = useNow();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Chat");
  const [suggestion, setSuggestion] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState("Yes\nNot for me");
  if (!me || !pref) return null;
  const view = activityView(state, params.id, me, pref, now);
  if (!view || !view.conversationId) return <main className="p-6">This room isn't open.</main>;
  const member = view.activity.hostId === me.id || ["going", "checked-in", "attended", "pending"].includes(view.myRsvp?.status ?? "");
  const prompts = state.prompts.filter((item) => item.activityId === view.activity.id);
  const polls = state.polls.filter((item) => item.activityId === view.activity.id);
  const ideas = state.suggestions.filter((item) => item.activityId === view.activity.id);
  const list = state.checklists.find((item) => item.activityId === view.activity.id && item.userId === me.id);
  const hosting = view.activity.hostId === me.id;

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <Link href={`/activity/${view.activity.id}`} className="text-sm font-semibold text-muted">Back to the plan</Link>
      <p className="mt-2 text-xs font-semibold tracking-[0.14em] text-coral-deep uppercase">Before</p>
      <h1 className="font-display text-4xl leading-tight">{view.activity.title}</h1>
      <p className="mt-1 text-sm text-muted">{formatWhen(view.activity.startsAt).label} · starts in {countdown(view.activity.startsAt, now)}</p>
      <div className="mt-4 flex gap-2 overflow-x-auto">
        {TABS.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-full px-3 py-2 text-sm font-semibold ${tab === item ? "bg-navy text-white" : "bg-cream"}`}>
            {item}
          </button>
        ))}
      </div>
      {!member ? <p className="mt-6 text-sm leading-6">Join first. The room is for people who are actually coming.</p> : null}
      {member && tab === "Chat" ? <div className="mt-4"><Thread conversationId={view.conversationId} /></div> : null}
      {member && tab === "Prompts" ? (
        <div className="mt-4 grid gap-4">
          {prompts.map((prompt) => {
            const answers = state.promptAnswers.filter((item) => item.promptId === prompt.id);
            const mine = answers.find((item) => item.userId === me.id);
            return (
              <section key={prompt.id} className="rounded-[1.4rem] bg-cream p-4">
                <h2 className="font-display text-2xl">{prompt.prompt}</h2>
                <form
                  className="mt-3 grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    api.answerPrompt(prompt.id, String(data.get("answer") ?? ""));
                  }}
                >
                  <label className="sr-only" htmlFor={prompt.id}>Your answer</label>
                  <textarea id={prompt.id} name="answer" defaultValue={mine?.body ?? ""} className={`${inputClass} min-h-20`} placeholder="A sentence is enough." />
                  <button type="submit" className="justify-self-start rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white">Share with the group</button>
                </form>
                <ul className="mt-3 grid gap-2">
                  {answers.map((answer) => {
                    const user = state.users.find((item) => item.id === answer.userId);
                    if (!user) return null;
                    return (
                      <li key={answer.id} className="flex gap-2 text-sm leading-6">
                        <Portrait user={user} size={28} />
                        <span><strong>{user.name}.</strong> {answer.body}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
      {member && tab === "Polls" ? (
        <div className="mt-4 grid gap-4">
          {polls.map((poll) => {
            const choices = state.pollOptions.filter((item) => item.pollId === poll.id);
            const votes = state.pollVotes.filter((item) => item.pollId === poll.id);
            const mine = votes.find((item) => item.userId === me.id);
            return (
              <section key={poll.id} className="rounded-[1.4rem] bg-cream p-4">
                <h2 className="font-display text-2xl">{poll.question}</h2>
                <div className="mt-3 grid gap-2">
                  {choices.map((choice) => {
                    const count = votes.filter((item) => item.optionId === choice.id).length;
                    const width = votes.length ? Math.round((count / votes.length) * 100) : 0;
                    return (
                      <button key={choice.id} type="button" onClick={() => api.vote(poll.id, choice.id)} className={`rounded-2xl border px-3 py-3 text-left text-sm ${mine?.optionId === choice.id ? "border-coral bg-[#fff4ec]" : "border-line bg-white"}`}>
                        <span className="flex justify-between font-semibold"><span>{choice.label}</span><span>{count}</span></span>
                        <span className="mt-2 block h-1.5 rounded-full bg-sand"><span className="block h-1.5 rounded-full bg-coral" style={{ width: `${width}%` }} /></span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {hosting ? (
            <form
              className="grid gap-2 rounded-[1.4rem] bg-sand p-4"
              onSubmit={(event) => {
                event.preventDefault();
                api.createPoll(view.activity.id, question, options.split("\n"), false);
                setQuestion("");
              }}
            >
              <h2 className="font-display text-2xl">New poll</h2>
              <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Question" className={inputClass} aria-label="Poll question" />
              <textarea value={options} onChange={(event) => setOptions(event.target.value)} className={`${inputClass} min-h-24`} aria-label="Choices, one per line" />
              <button type="submit" className="justify-self-start rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Open poll</button>
            </form>
          ) : null}
        </div>
      ) : null}
      {member && tab === "Board" ? (
        <div className="mt-4">
          <ul className="grid gap-2">
            {ideas.map((idea) => {
              const user = state.users.find((item) => item.id === idea.userId);
              return <li key={idea.id} className="rounded-2xl bg-cream px-3 py-3 text-sm"><strong>{user?.name}: </strong>{idea.title}</li>;
            })}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              api.addSuggestion(view.activity.id, suggestion);
              setSuggestion("");
            }}
          >
            <label className="sr-only" htmlFor="idea">Suggestion</label>
            <input id="idea" value={suggestion} onChange={(event) => setSuggestion(event.target.value)} placeholder="A song, a stop, a snack" className={inputClass} />
            <button type="submit" className="rounded-full bg-coral px-4 font-semibold text-white">Add</button>
          </form>
        </div>
      ) : null}
      {member && tab === "Plan" ? (
        <div className="mt-4 grid gap-4">
          {list ? (
            <ul className="grid gap-2">
              {list.items.map((item) => (
                <li key={item.id}>
                  <label className="flex items-start gap-3 rounded-2xl bg-cream px-3 py-3 text-sm">
                    <input type="checkbox" checked={item.done} onChange={() => api.toggleChecklist(view.activity.id, item.id)} />
                    {item.label}
                  </label>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Your checklist appears once you're confirmed.</p>}
          <button type="button" onClick={() => api.enRoute(view.activity.id)} className="rounded-full bg-navy py-3 font-semibold text-white">I'm on my way</button>
          {hosting ? (
            <section className="rounded-[1.4rem] bg-[#fff4ec] p-4">
              <h2 className="font-display text-2xl">Icebreakers from the room</h2>
              <ul className="mt-2 grid gap-2 text-sm leading-6">
                {icebreakers(state, view.activity.id).map((line) => <li key={line}>{line}</li>)}
              </ul>
            </section>
          ) : null}
          <button type="button" onClick={() => api.leave(view.activity.id)} className="text-sm font-semibold text-muted">I can't make it. Give my place away.</button>
        </div>
      ) : null}
    </main>
  );
}
