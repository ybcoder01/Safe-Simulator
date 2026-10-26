import { describe, expect, it } from "vitest";
import { createSeed } from "./seed";
import { reduce } from "./reducer";
import {
  activityView,
  canDiscover,
  compatibility,
  exactVisible,
  occupyingCount,
  phaseOf,
  placeLabel,
  spotsLeft,
  waitIndex,
} from "./logic";
import type { AppState } from "./types";

const now = new Date("2026-10-26T10:23:00.000Z");

function mayaState(): AppState {
  return reduce(createSeed(now), { type: "sign-in", userId: "user_maya" });
}

function view(state: AppState, id: string) {
  const maya = state.users.find((user) => user.id === "user_maya");
  const pref = state.preferences.find((item) => item.userId === "user_maya");
  if (!maya || !pref) throw new Error("missing maya");
  const result = activityView(state, id, maya, pref, now);
  if (!result) throw new Error(`missing ${id}`);
  return result;
}

describe("seed journey", () => {
  it("keeps every gathering inside its capacity", () => {
    const state = createSeed(now);
    for (const activity of state.activities) {
      expect(occupyingCount(state.rsvps, activity.id)).toBeLessThanOrEqual(activity.capacity);
    }
    expect(spotsLeft(state.activities.find((item) => item.id === "act_dinner")!, state.rsvps)).toBe(0);
    expect(waitIndex(state, "act_dinner", "user_maya")).toBe(1);
    expect(phaseOf(state.activities.find((item) => item.id === "act_cowork")!, now)).toBe("live");
    expect(phaseOf(state.activities.find((item) => item.id === "act_sunset")!, now)).toBe("upcoming");
  });

  it("hides private addresses and invite-only plans", () => {
    const state = createSeed(now);
    const venue = state.venues.find((item) => item.id === "ven_private")!;
    expect(exactVisible(state, "user_maya", state.activities.find((item) => item.id === "act_private")!)).toBe(false);
    expect(placeLabel(venue, false)).not.toContain("Boulevard");
    expect(placeLabel(venue, true)).toContain("Boulevard Point");
    expect(canDiscover(state, "user_noah", state.activities.find((item) => item.id === "act_private")!)).toBe(false);
    expect(canDiscover(state, "user_maya", state.activities.find((item) => item.id === "act_private")!)).toBe(true);
  });
});

describe("compatibility", () => {
  it("uses interests and pace, never sensitive traits", () => {
    const state = mayaState();
    const maya = state.users.find((user) => user.id === "user_maya")!;
    const pref = state.preferences.find((item) => item.userId === "user_maya")!;
    const sunset = state.activities.find((item) => item.id === "act_sunset")!;
    const fit = compatibility(maya, pref, sunset);
    expect(fit.score).toBeGreaterThan(70);
    expect(fit.reasons.join(" ").toLowerCase()).toContain("walk");
    const blob = JSON.stringify(fit).toLowerCase();
    for (const word of ["gender", "age", "attractive", "religion", "follower"]) {
      expect(blob).not.toContain(word);
    }
  });
});

describe("attendance and waitlist", () => {
  it("promotes the first waiting person when someone cancels", () => {
    let state = mayaState();
    state = { ...state, sessionUserId: "user_luca" };
    state = reduce(state, { type: "leave", activityId: "act_dinner", now: now.toISOString() });
    const maya = state.rsvps.find((item) => item.activityId === "act_dinner" && item.userId === "user_maya");
    expect(maya?.status).toBe("going");
    expect(state.waitlist.some((item) => item.userId === "user_maya")).toBe(false);
    expect(waitIndex(state, "act_dinner", "user_samir")).toBe(1);
    expect(occupyingCount(state.rsvps, "act_dinner")).toBeLessThanOrEqual(6);
    expect(state.notices.some((item) => item.userId === "user_maya" && item.kind === "waitlist" && item.body.includes("You're in"))).toBe(true);
    const publicShame = state.messages.some((item) => item.body.toLowerCase().includes("rejected"));
    expect(publicShame).toBe(false);
  });

  it("lets Maya check in to the live sprint and not to a later coffee", () => {
    let state = mayaState();
    state = reduce(state, { type: "check-in", activityId: "act_cowork", now: now.toISOString() });
    expect(state.rsvps.find((item) => item.activityId === "act_cowork" && item.userId === "user_maya")?.status).toBe("checked-in");
    const before = state;
    state = reduce(state, { type: "check-in", activityId: "act_coffee", now: now.toISOString() });
    expect(state.toast?.tone).toBe("info");
    expect(state.rsvps.find((item) => item.id === "rsvp_act_coffee_user_omar")?.status).toBe(before.rsvps.find((item) => item.id === "rsvp_act_coffee_user_omar")?.status);
  });
});

describe("trust boundaries", () => {
  it("keeps women-only join behind an explicit opt-in", () => {
    let state = mayaState();
    state = reduce(state, { type: "join", activityId: "act_yoga", now: now.toISOString() });
    expect(state.rsvps.some((item) => item.activityId === "act_yoga" && item.userId === "user_maya")).toBe(false);
    state = reduce(state, { type: "opt-women-only", value: true });
    state = reduce(state, { type: "join", activityId: "act_yoga", now: now.toISOString() });
    expect(state.rsvps.find((item) => item.activityId === "act_yoga" && item.userId === "user_maya")?.status).toBe("going");
  });

  it("reveals a private address only after the invite is accepted", () => {
    let state = mayaState();
    expect(view(state, "act_private").exact).toBe(false);
    expect(view(state, "act_private").where).not.toContain("1204");
    state = reduce(state, { type: "join", activityId: "act_private", now: now.toISOString() });
    expect(view(state, "act_private").exact).toBe(true);
    expect(view(state, "act_private").where).toContain("1204");
  });

  it("opens a connection only when the wish is mutual", () => {
    let state = mayaState();
    const before = state.notices.filter((item) => item.userId === "user_sofia").length;
    state = reduce(state, { type: "connect", otherUserId: "user_sofia", activityId: "act_past_lang", now: now.toISOString() });
    expect(state.connections.some((item) => item.userAId === "user_sofia" || item.userBId === "user_sofia")).toBe(false);
    expect(state.notices.filter((item) => item.userId === "user_sofia").length).toBe(before);
    state = reduce(state, { type: "connect", otherUserId: "user_hana", activityId: "act_past_lang", now: now.toISOString() });
    expect(state.connections.some((item) => item.userBId === "user_hana" || item.userAId === "user_hana")).toBe(true);
    expect(state.notices.some((item) => item.userId === "user_hana" && item.title === "It's mutual")).toBe(true);
  });

  it("routes a safety flag into moderation rather than a public review", () => {
    let state = mayaState();
    state = reduce(state, {
      type: "feedback",
      activityId: "act_past_lang",
      hostRating: 2,
      eventRating: 2,
      belonging: 2,
      note: "A guest would not stop following me out.",
      safetyConcern: true,
      now: now.toISOString(),
    });
    const review = state.reviews.find((item) => item.authorId === "user_maya" && item.activityId === "act_past_lang");
    expect(review?.safetyConcern).toBe(true);
    expect(state.reports.some((item) => item.reporterId === "user_maya" && item.status === "open")).toBe(true);
  });
});
