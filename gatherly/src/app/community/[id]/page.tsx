"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { formatWhen } from "@/lib/format";
import { phaseOf } from "@/lib/logic";
import { Thread } from "@/components/thread";
import { useViewer } from "@/components/shell";
import { useNow } from "@/components/use-now";
import { Cover, Portrait } from "@/components/ui";

export default function CommunityPage() {
  const params = useParams<{ id: string }>();
  const { state, me } = useViewer();
  const now = useNow();
  if (!me) return null;
  const community = state.communities.find((item) => item.id === params.id);
  if (!community) return <main className="p-6">That circle isn't here.</main>;
  const members = state.communityMembers.filter((item) => item.communityId === community.id);
  const organizer = state.users.find((user) => user.id === community.organizerId);
  const plans = state.activities.filter((activity) => activity.communityId === community.id && activity.status !== "cancelled");
  const upcoming = plans.filter((activity) => phaseOf(activity, now) !== "past");
  const past = plans.filter((activity) => phaseOf(activity, now) === "past");
  const conversation = state.conversations.find((item) => item.communityId === community.id);
  const member = members.some((item) => item.userId === me.id);

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <div className="h-48 overflow-hidden rounded-[1.8rem]"><Cover src={community.cover} alt="" /></div>
      <h1 className="font-display mt-4 text-4xl leading-tight">{community.name}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{community.summary}</p>
      <p className="mt-2 text-sm">{community.schedule}</p>
      <p className="mt-2 text-sm text-teal">{community.joinNote}</p>
      {organizer ? (
        <p className="mt-3 flex items-center gap-2 text-sm">
          <Portrait user={organizer} size={32} />
          Organized by <Link href={`/people/${organizer.id}`} className="font-semibold">{organizer.name}</Link>
        </p>
      ) : null}
      <section className="mt-6">
        <h2 className="font-display text-2xl">Upcoming</h2>
        <ul className="mt-2 grid gap-2">
          {upcoming.map((activity) => (
            <li key={activity.id}><Link href={`/activity/${activity.id}`} className="block rounded-2xl bg-cream px-3 py-3 text-sm"><strong>{activity.title}</strong><span className="block text-muted">{formatWhen(activity.startsAt).label}</span></Link></li>
          ))}
        </ul>
        {upcoming.length === 0 ? <p className="mt-2 text-sm text-muted">No upcoming plan. The circle still doesn't gate the ones that appear.</p> : null}
      </section>
      <section className="mt-6">
        <h2 className="font-display text-2xl">People</h2>
        <ul className="mt-3 flex flex-wrap gap-3">
          {members.map((memberRow) => {
            const user = state.users.find((item) => item.id === memberRow.userId);
            if (!user) return null;
            return (
              <li key={memberRow.id}>
                <Link href={`/people/${user.id}`} className="block w-20 text-center text-xs font-semibold">
                  <Portrait user={user} size={52} />
                  <span className="mt-1 block">{user.name.split(" ")[0]}</span>
                  <span className="block text-muted">{memberRow.role}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="font-display text-2xl">Past plans</h2>
        <ul className="mt-2 grid gap-2 text-sm">
          {past.map((activity) => <li key={activity.id}><Link href={`/activity/${activity.id}/after`}>{activity.title}</Link></li>)}
        </ul>
      </section>
      <section className="mt-6">
        <h2 className="font-display text-2xl">Circle chat</h2>
        {member && conversation ? <div className="mt-3"><Thread conversationId={conversation.id} /></div> : <p className="mt-2 text-sm text-muted">Come to a plan first. The chat is a convenience, not a ticket.</p>}
      </section>
      <p className="mt-6 text-xs text-muted">Invite link for this demo: {typeof window === "undefined" ? "" : ""}gatherly.app/community/{community.id}</p>
    </main>
  );
}
