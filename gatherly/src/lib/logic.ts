import { BINGO, MISSIONS } from "./copy";
import { distanceKm, dubaiKey, dubaiParts, firstName, travelLabel } from "./format";
import type {
  Activity,
  ActivityPhase,
  AppState,
  Community,
  Filters,
  RSVP,
  RsvpStatus,
  User,
  UserPreference,
  Venue,
} from "./types";

export const OCCUPYING: RsvpStatus[] = ["pending", "going", "checked-in", "attended"];

const SENSITIVE = ["gender", "age", "attractive", "religion", "ethnicity", "income", "follower"];

export function phaseOf(activity: Activity, now: Date): ActivityPhase {
  if (activity.status === "cancelled") return "cancelled";
  const start = new Date(activity.startsAt).getTime();
  const end = start + activity.durationMin * 60_000;
  const time = now.getTime();
  if (time < start) return "upcoming";
  if (time < end) return "live";
  return "past";
}

export function checkInOpen(activity: Activity, now: Date) {
  if (activity.status === "cancelled") return false;
  const start = new Date(activity.startsAt).getTime();
  const end = start + activity.durationMin * 60_000;
  const time = now.getTime();
  return time >= start - 20 * 60_000 && time <= end;
}

export function rsvpFor(state: AppState, activityId: string, userId: string) {
  return state.rsvps.find((item) => item.activityId === activityId && item.userId === userId) ?? null;
}

export function occupyingCount(rsvps: RSVP[], activityId: string) {
  return rsvps.filter((item) => item.activityId === activityId && OCCUPYING.includes(item.status)).length;
}

export function spotsLeft(activity: Activity, rsvps: RSVP[]) {
  return activity.capacity - occupyingCount(rsvps, activity.id);
}

export function blockedBy(state: AppState, viewerId: string, otherId: string) {
  return state.blocks.some((block) => block.userId === viewerId && block.blockedUserId === otherId);
}

export function userById(state: AppState, id: string) {
  return state.users.find((user) => user.id === id) ?? null;
}

export function preferenceFor(state: AppState, userId: string) {
  return state.preferences.find((item) => item.userId === userId) ?? null;
}

export interface Fit {
  score: number;
  reasons: string[];
}

export function compatibility(user: User, preference: UserPreference, activity: Activity): Fit {
  let score = 56;
  const reasons: string[] = [];
  const shared = activity.tags.filter((tag) =>
    user.interests.some((interest) => interest.toLowerCase() === tag.toLowerCase()),
  );
  if (shared.length > 0) {
    score += Math.min(24, shared.length * 8);
    const label = shared.slice(0, 2).join(" and ").toLowerCase();
    reasons.push(`Shared interest in ${label}`);
  }
  if (preference.energy.includes(activity.energy)) {
    score += 10;
    reasons.push(`${activity.energy} is a pace you asked for`);
  }
  if (activity.capacity >= preference.groupMin && activity.capacity <= preference.groupMax) {
    score += 8;
    reasons.push(`A group of ${activity.capacity} matches the size you prefer`);
  } else if (activity.capacity <= 10) {
    score += 3;
    reasons.push("Small enough that you will actually meet people");
  }
  const language = activity.languages.find(
    (item) => preference.languages.includes(item) || user.languages.includes(item),
  );
  if (language) {
    score += 6;
    reasons.push(`Held in ${language}`);
  }
  if (activity.price === 0 && preference.prefersFree) {
    score += 4;
    reasons.push("Free, which you prefer");
  } else if (preference.maxPrice != null && activity.price > preference.maxPrice) {
    score -= 8;
  }
  if (
    preference.accessibilityNeeds.length > 0 &&
    activity.accessibility.some((item) => preference.accessibilityNeeds.includes(item))
  ) {
    score += 6;
    reasons.push("Lists access details you asked for");
  }
  if (activity.experience === "Newcomer-friendly") {
    score += 4;
    reasons.push("Glad to have someone new in the circle");
  }
  score = Math.max(48, Math.min(97, score));
  if (reasons.length === 0) reasons.push("A small nearby plan with room to talk");
  const blob = ` ${reasons.join(" ").toLowerCase()} `;
  if (SENSITIVE.some((word) => blob.includes(` ${word} `))) {
    throw new Error("Compatibility copy must stay clear of sensitive traits");
  }
  return { score, reasons };
}

export function canDiscover(state: AppState, viewerId: string, activity: Activity) {
  if (blockedBy(state, viewerId, activity.hostId)) return false;
  if (activity.audience !== "private") return true;
  if (activity.hostId === viewerId) return true;
  const rsvp = rsvpFor(state, activity.id, viewerId);
  return Boolean(rsvp && rsvp.status !== "cancelled");
}

export function exactVisible(state: AppState, viewerId: string, activity: Activity) {
  if (activity.hostId === viewerId) return true;
  if (activity.audience === "public") return true;
  const rsvp = rsvpFor(state, activity.id, viewerId);
  const inside = rsvp != null && ["going", "checked-in", "attended"].includes(rsvp.status);
  return inside;
}

export function placeLabel(venue: Venue, exact: boolean) {
  if (exact) return `${venue.name} · ${venue.exactAddress}`;
  return `${venue.neighborhood}, Dubai`;
}

export function pinFor(venue: Venue, exact: boolean) {
  return exact
    ? { lat: venue.exactLat, lng: venue.exactLng }
    : { lat: venue.areaLat, lng: venue.areaLng };
}

export function reliability(userId: string, rsvps: RSVP[]) {
  const history = rsvps.filter((item) => item.userId === userId && (item.status === "attended" || item.status === "no-show"));
  if (history.length < 2) return { label: "New here", tone: "new" as const, rate: null };
  const rate = history.filter((item) => item.status === "attended").length / history.length;
  if (rate >= 0.9) return { label: "Keeps plans", tone: "good" as const, rate };
  if (rate >= 0.75) return { label: "Usually attends", tone: "good" as const, rate };
  return { label: "Missed a few without cancelling", tone: "watch" as const, rate };
}

export function hostReputation(hostId: string, state: AppState) {
  const reviews = state.reviews.filter((review) => review.hostId === hostId && !review.safetyConcern);
  if (reviews.length === 0) return null;
  const average = reviews.reduce((sum, review) => sum + review.hostRating, 0) / reviews.length;
  const belonging = reviews.reduce((sum, review) => sum + review.belonging, 0) / reviews.length;
  return {
    average: Math.round(average * 10) / 10,
    belonging: Math.round(belonging * 10) / 10,
    count: reviews.length,
  };
}

export function waitIndex(state: AppState, activityId: string, userId: string) {
  const rows = state.waitlist
    .filter((item) => item.activityId === activityId)
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const index = rows.findIndex((item) => item.userId === userId);
  return index === -1 ? null : index + 1;
}

export interface ActivityView {
  activity: Activity;
  host: User;
  venue: Venue;
  phase: ActivityPhase;
  attendees: User[];
  waitCount: number;
  myWaitIndex: number | null;
  spotsLeft: number;
  myRsvp: RSVP | null;
  fit: Fit;
  distanceLabel: string;
  km: number;
  exact: boolean;
  where: string;
  conversationId: string | null;
  community: Community | null;
}

export function activityView(state: AppState, activityId: string, viewer: User, preference: UserPreference, now: Date): ActivityView | null {
  const activity = state.activities.find((item) => item.id === activityId);
  if (!activity) return null;
  const host = userById(state, activity.hostId);
  const venue = state.venues.find((item) => item.id === activity.venueId);
  if (!host || !venue) return null;
  const exact = exactVisible(state, viewer.id, activity);
  const point = pinFor(venue, exact);
  const km = distanceKm(viewer, point);
  const attendees = state.rsvps
    .filter((item) => item.activityId === activity.id && OCCUPYING.includes(item.status))
    .map((item) => userById(state, item.userId))
    .filter((user): user is User => user != null)
    .sort((a, b) => Number(b.id === host.id) - Number(a.id === host.id));
  return {
    activity,
    host,
    venue,
    phase: phaseOf(activity, now),
    attendees,
    waitCount: state.waitlist.filter((item) => item.activityId === activity.id).length,
    myWaitIndex: waitIndex(state, activity.id, viewer.id),
    spotsLeft: spotsLeft(activity, state.rsvps),
    myRsvp: rsvpFor(state, activity.id, viewer.id),
    fit: compatibility(viewer, preference, activity),
    distanceLabel: travelLabel(km),
    km,
    exact,
    where: placeLabel(venue, exact),
    conversationId: state.conversations.find((item) => item.activityId === activity.id)?.id ?? null,
    community: activity.communityId
      ? (state.communities.find((item) => item.id === activity.communityId) ?? null)
      : null,
  };
}

function sameDubaiDay(a: string, b: string) {
  return dubaiKey(a) === dubaiKey(b);
}

function isWeekend(iso: string) {
  const day = dubaiParts(new Date(iso)).weekday;
  return day === 5 || day === 6 || day === 0;
}

export function searchText(view: ActivityView) {
  return [view.activity.title, view.activity.description, view.activity.type, view.host.name, view.venue.neighborhood, view.activity.tags.join(" ")]
    .join(" ")
    .toLowerCase();
}

export function matchesQuery(view: ActivityView, filters: Filters, now: Date) {
  const { activity } = view;
  if (filters.womenOnly === "hide" && activity.audience === "women-only") return false;
  if (filters.womenOnly === "only" && activity.audience !== "women-only") return false;
  if (filters.type && activity.type !== filters.type) return false;
  if (filters.energy && activity.energy !== filters.energy) return false;
  if (filters.language && !activity.languages.includes(filters.language)) return false;
  if (filters.stepFree && !activity.accessibility.includes("Step-free")) return false;
  if (filters.price === "free" && activity.price > 0) return false;
  if (filters.price === "under80" && activity.price >= 80) return false;
  if (filters.group === "intimate" && activity.capacity > 6) return false;
  if (filters.group === "small" && (activity.capacity < 7 || activity.capacity > 10)) return false;
  if (filters.distanceKm != null && view.km > filters.distanceKm) return false;
  if (filters.when === "today" && !sameDubaiDay(activity.startsAt, now.toISOString())) return false;
  if (filters.when === "tomorrow") {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    if (!sameDubaiDay(activity.startsAt, tomorrow)) return false;
  }
  if (filters.when === "weekend" && !isWeekend(activity.startsAt)) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  const haystack = searchText(view);
  return query.split(/\s+/).every((part) => haystack.includes(part));
}

export function discoverable(state: AppState, viewer: User, preference: UserPreference, now: Date) {
  return state.activities
    .filter((activity) => activity.status !== "cancelled" && canDiscover(state, viewer.id, activity))
    .map((activity) => activityView(state, activity.id, viewer, preference, now))
    .filter((view): view is ActivityView => view != null)
    .filter((view) => view.phase === "upcoming" || view.phase === "live")
    .sort((a, b) => a.activity.startsAt.localeCompare(b.activity.startsAt));
}

export function icebreakers(state: AppState, activityId: string) {
  const activity = state.activities.find((item) => item.id === activityId);
  const prompts = state.prompts.filter((item) => item.activityId === activityId);
  const lines: string[] = [];
  for (const answer of state.promptAnswers) {
    const prompt = prompts.find((item) => item.id === answer.promptId);
    const user = userById(state, answer.userId);
    if (!prompt || !user) continue;
    const snippet = answer.body.trim().replace(/\.$/, "");
    if (prompt.prompt.includes("hours")) lines.push(`Ask ${firstName(user.name)} about ${snippet}.`);
    else if (prompt.prompt.includes("made you join")) lines.push(`${firstName(user.name)} came because ${snippet.charAt(0).toLowerCase()}${snippet.slice(1)}. Start there.`);
  }
  if (lines.length === 0 && activity) {
    lines.push(`Ask each person what made them choose ${activity.title}, then let one answer run longer than feels polite.`);
  }
  return lines.slice(0, 3);
}

export function mutualWith(state: AppState, a: string, b: string) {
  return (
    state.connections.find(
      (item) =>
        (item.userAId === a && item.userBId === b) || (item.userAId === b && item.userBId === a),
    ) ?? null
  );
}

export function requested(state: AppState, from: string, to: string, activityId: string) {
  return state.connectionRequests.some(
    (item) => item.fromUserId === from && item.toUserId === to && item.activityId === activityId,
  );
}

export function unreadCount(state: AppState, userId: string) {
  return state.conversations.filter((conversation) => {
    if (!conversation.memberIds.includes(userId)) return false;
    const read = state.reads.find((item) => item.conversationId === conversation.id && item.userId === userId);
    const last = read?.lastReadAt ?? "1970-01-01T00:00:00.000Z";
    return state.messages.some(
      (message) =>
        message.conversationId === conversation.id &&
        message.senderId !== userId &&
        message.createdAt > last &&
        (message.senderId == null || !blockedBy(state, userId, message.senderId)),
    );
  }).length;
}

export function games() {
  return { bingo: BINGO, missions: MISSIONS };
}

export function peopleMet(state: AppState, userId: string) {
  const ids = new Set<string>();
  for (const connection of state.connections) {
    if (connection.userAId === userId) ids.add(connection.userBId);
    if (connection.userBId === userId) ids.add(connection.userAId);
  }
  return [...ids].map((id) => userById(state, id)).filter((user): user is User => user != null);
}

export function journal(state: AppState, userId: string, now: Date) {
  return state.activities
    .filter((activity) => phaseOf(activity, now) === "past")
    .filter((activity) => {
      const rsvp = rsvpFor(state, activity.id, userId);
      return rsvp?.status === "attended" || activity.hostId === userId;
    })
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export function suggestedNext(state: AppState, viewer: User, preference: UserPreference, now: Date, activityId: string) {
  const current = state.activities.find((item) => item.id === activityId);
  return discoverable(state, viewer, preference, now)
    .filter((view) => view.activity.id !== activityId)
    .filter((view) => view.myRsvp == null || view.myRsvp.status === "cancelled" || view.myRsvp.status === "invited")
    .map((view) => ({
      view,
      overlap: current ? view.activity.tags.filter((tag) => current.tags.includes(tag)).length : 0,
    }))
    .sort((a, b) => b.overlap - a.overlap || b.view.fit.score - a.view.fit.score)
    .slice(0, 3)
    .map((item) => item.view);
}

export function attendedTogether(state: AppState, activityId: string) {
  return state.rsvps
    .filter((item) => item.activityId === activityId && item.status === "attended")
    .map((item) => userById(state, item.userId))
    .filter((user): user is User => user != null);
}
