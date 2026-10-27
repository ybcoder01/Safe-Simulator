"use client";

import Link from "next/link";
import { blockedBy, unreadCount } from "@/lib/logic";
import { useViewer } from "@/components/shell";
import { EmptyArt, Portrait } from "@/components/ui";

export default function MessagesPage() {
  const { state, me } = useViewer();
  if (!me) return null;
  const conversations = state.conversations
    .filter((conversation) => conversation.memberIds.includes(me.id))
    .map((conversation) => {
      const messages = state.messages.filter((message) => message.conversationId === conversation.id);
      const latest = messages.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
      const read = state.reads.find((item) => item.conversationId === conversation.id && item.userId === me.id);
      const unread = messages.some((message) => message.senderId !== me.id && message.createdAt > (read?.lastReadAt ?? "") && (message.senderId == null || !blockedBy(state, me.id, message.senderId)));
      const other = conversation.kind === "direct" ? state.users.find((user) => conversation.memberIds.includes(user.id) && user.id !== me.id) : null;
      return { conversation, latest, unread, other };
    })
    .sort((a, b) => (b.latest?.createdAt ?? "").localeCompare(a.latest?.createdAt ?? ""));

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="font-display text-4xl">Messages</h1>
      <p className="mt-1 text-sm text-muted">{unreadCount(state, me.id)} conversations with something new. Direct messages open only after a mutual yes.</p>
      <ul className="mt-4 grid gap-2">
        {conversations.map(({ conversation, latest, unread, other }) => (
          <li key={conversation.id}>
            <Link href={conversation.kind === "activity" && conversation.activityId ? `/activity/${conversation.activityId}/room` : `/messages/${conversation.id}`} className="flex items-center gap-3 rounded-3xl bg-cream p-3">
              {other ? <Portrait user={other} size={48} /> : <span className="grid h-12 w-12 place-items-center rounded-full bg-sand text-xs font-bold">{conversation.kind === "community" ? "Circle" : "Plan"}</span>}
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  {other?.name ?? conversation.title}
                  {unread ? <span className="h-2 w-2 rounded-full bg-coral" /> : null}
                </span>
                <span className="block truncate text-sm text-muted">{latest?.body ?? "No messages yet"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {conversations.length === 0 ? <div className="mt-4"><EmptyArt title="No rooms yet" body="Join a gathering and the chat opens with the people who are actually coming." /></div> : null}
    </main>
  );
}
