"use client";

import Link from "next/link";
import { useEffect } from "react";
import { formatWhen } from "@/lib/format";
import { useViewer } from "@/components/shell";
import { EmptyArt } from "@/components/ui";

export default function NotificationsPage() {
  const { state, api, me } = useViewer();
  useEffect(() => {
    api.readNotices();
  }, [api]);
  if (!me) return null;
  const notices = state.notices.filter((notice) => notice.userId === me.id);
  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <h1 className="font-display text-4xl">Notices</h1>
      <p className="mt-1 text-sm text-muted">Reminders, a place opening up, and a mutual yes. Not a feed.</p>
      <ul className="mt-4 grid gap-2">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Link href={notice.href} className="block rounded-3xl bg-cream px-4 py-3">
              <span className="font-semibold">{notice.title}</span>
              <span className="mt-1 block text-sm leading-6 text-muted">{notice.body}</span>
              <span className="mt-1 block text-xs text-muted">{formatWhen(notice.createdAt).label}</span>
            </Link>
          </li>
        ))}
      </ul>
      {notices.length === 0 ? <div className="mt-4"><EmptyArt title="All quiet" body="When a place opens or a reminder is due, it lands here." /></div> : null}
    </main>
  );
}
