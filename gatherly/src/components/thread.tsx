"use client";

import { useState } from "react";
import { firstName } from "@/lib/format";
import { blockedBy } from "@/lib/logic";
import { useViewer } from "./shell";
import { Portrait, inputClass } from "./ui";

const EMOJIS = ["👍", "😂", "🧡", "✨", "🙌"];

export function Thread({ conversationId }: { conversationId: string }) {
  const { state, api, me } = useViewer();
  const [body, setBody] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const conversation = state.conversations.find((item) => item.id === conversationId);
  if (!me || !conversation) return <p className="text-sm text-muted">This room isn't open yet.</p>;
  if (!conversation.memberIds.includes(me.id)) return <p className="text-sm text-muted">Join the gathering to enter the room.</p>;
  const messages = state.messages.filter((message) => message.conversationId === conversationId);
  const roots = messages.filter((message) => !message.parentId);
  const parent = messages.find((message) => message.id === parentId);

  return (
    <div>
      <div className="space-y-3">
        {roots.map((message) => (
          <Bubble key={message.id} messageId={message.id} conversationId={conversationId} onReply={setParentId} />
        ))}
        {roots.length === 0 ? <p className="text-sm text-muted">The room is quiet. A specific hello beats a generic one.</p> : null}
      </div>
      <form
        className="sticky bottom-24 z-20 mt-4 grid gap-2 rounded-3xl bg-sand/95 p-2 backdrop-blur md:bottom-4"
        onSubmit={(event) => {
          event.preventDefault();
          api.sendMessage(conversationId, body, parentId);
          setBody("");
          setParentId(null);
        }}
      >
        {parent ? (
          <p className="text-xs text-muted">
            Replying to {parent.senderId ? firstName(state.users.find((user) => user.id === parent.senderId)?.name ?? "them") : "the room"}{" "}
            <button type="button" className="font-semibold text-coral-deep" onClick={() => setParentId(null)}>
              Cancel
            </button>
          </p>
        ) : null}
        <label className="sr-only" htmlFor={`composer-${conversationId}`}>
          Message
        </label>
        <textarea id={`composer-${conversationId}`} value={body} onChange={(event) => setBody(event.target.value)} className={`${inputClass} min-h-20`} placeholder="Say something a person can answer." />
        <button type="submit" className="justify-self-start rounded-full bg-coral px-4 py-2 text-sm font-semibold text-white">
          Send
        </button>
      </form>
    </div>
  );
}

function Bubble({
  messageId,
  conversationId,
  onReply,
}: {
  messageId: string;
  conversationId: string;
  onReply: (id: string) => void;
}) {
  const { state, api, me } = useViewer();
  const message = state.messages.find((item) => item.id === messageId);
  if (!message || !me) return null;
  if (message.senderId && blockedBy(state, me.id, message.senderId)) {
    return <p className="text-xs text-muted">A message from someone you blocked is hidden.</p>;
  }
  const sender = message.senderId ? state.users.find((user) => user.id === message.senderId) : null;
  const replies = state.messages.filter((item) => item.parentId === message.id && item.conversationId === conversationId);
  const tone = message.kind === "announcement" ? "border-coral/40 bg-[#fff4ec]" : message.kind === "system" || message.kind === "enroute" ? "bg-sand" : "bg-white";
  return (
    <article className={`rounded-2xl border border-line px-3 py-3 ${tone}`}>
      <div className="flex items-center gap-2">
        {sender ? <Portrait user={sender} size={28} /> : <span className="text-xs font-semibold text-teal">Gatherly</span>}
        <p className="text-sm font-semibold">{sender?.name ?? "Update"}</p>
        {message.kind === "announcement" ? <span className="text-xs font-semibold text-coral-deep">Host note</span> : null}
      </div>
      <p className="mt-2 text-sm leading-6">{message.body}</p>
      {message.kind === "text" || message.kind === "announcement" ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {EMOJIS.map((emoji) => {
            const count = message.reactions.filter((reaction) => reaction.emoji === emoji).length;
            const mine = message.reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === me.id);
            return (
              <button key={emoji} type="button" aria-pressed={mine} onClick={() => api.react(message.id, emoji)} className={`rounded-full px-2 py-1 text-xs ${mine ? "bg-navy text-white" : "bg-sand"}`}>
                {emoji} {count > 0 ? count : ""}
              </button>
            );
          })}
          <button type="button" onClick={() => onReply(message.id)} className="ml-auto text-xs font-semibold text-muted">
            Reply
          </button>
        </div>
      ) : null}
      {replies.length > 0 ? (
        <div className="mt-3 space-y-2 border-l-2 border-line pl-3">
          {replies.map((reply) => (
            <Bubble key={reply.id} messageId={reply.id} conversationId={conversationId} onReply={onReply} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
