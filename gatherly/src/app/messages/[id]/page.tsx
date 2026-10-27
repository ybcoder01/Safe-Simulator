"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { Thread } from "@/components/thread";
import { useViewer } from "@/components/shell";

export default function MessageThreadPage() {
  const params = useParams<{ id: string }>();
  const { state, api, me } = useViewer();
  const conversation = state.conversations.find((item) => item.id === params.id);
  useEffect(() => {
    if (conversation) api.readConversation(conversation.id);
  }, [api, conversation]);
  if (!me) return null;
  if (!conversation) return <main className="p-6">That conversation isn't here.</main>;
  const other = state.users.find((user) => user.id !== me.id && conversation.memberIds.includes(user.id));
  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <Link href="/messages" className="text-sm font-semibold text-muted">All messages</Link>
      <h1 className="font-display mt-2 text-4xl">{conversation.kind === "direct" && other ? other.name : conversation.title}</h1>
      <div className="mt-4">
        <Thread conversationId={conversation.id} />
      </div>
    </main>
  );
}
