import { CHECKLIST_LABELS, DEFAULT_PROMPTS, neighborhood } from "./copy";
import { checkInCode } from "./format";
import { blockedBy, checkInOpen, occupyingCount, phaseOf, rsvpFor, spotsLeft } from "./logic";
import { SCHEMA_VERSION, type Activity, type AppState, type Conversation, type Message, type RSVP, type RsvpStatus, type Toast } from "./types";

export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

type NoticeInput = {
  userId: string;
  title: string;
  body: string;
  href: string;
  kind: AppState["notices"][number]["kind"];
  createdAt: string;
};

export type Action =
  | { type: "hydrate"; state: AppState }
  | { type: "sign-in"; userId: string }
  | { type: "sign-out" }
  | { type: "complete-onboarding"; user: AppState["users"][number]; preference: AppState["preferences"][number] }
  | { type: "update-preference"; preference: AppState["preferences"][number] }
  | { type: "toggle-save"; activityId: string }
  | { type: "set-filters"; filters: AppState["filters"] }
  | { type: "clear-toast" }
  | { type: "read-notices" }
  | { type: "read-conversation"; conversationId: string; now: string }
  | { type: "join"; activityId: string; now: string }
  | { type: "leave"; activityId: string; now: string }
  | { type: "approve"; activityId: string; userId: string; now: string }
  | { type: "decline"; activityId: string; userId: string; now: string }
  | { type: "check-in"; activityId: string; now: string }
  | { type: "host-check-in"; activityId: string; userId: string; now: string }
  | { type: "check-in-code"; activityId: string; code: string; now: string }
  | { type: "en-route"; activityId: string; now: string }
  | { type: "send-message"; conversationId: string; body: string; parentId: string | null; now: string }
  | { type: "react"; messageId: string; emoji: string }
  | { type: "vote"; pollId: string; optionId: string; now: string }
  | { type: "create-poll"; activityId: string; question: string; options: string[]; live: boolean; now: string }
  | { type: "answer-prompt"; promptId: string; body: string; now: string }
  | { type: "add-suggestion"; activityId: string; title: string; now: string }
  | { type: "toggle-checklist"; activityId: string; itemId: string }
  | { type: "pulse"; activityId: string; value: "great" | "okay" | "help"; now: string }
  | { type: "share-location"; activityId: string; on: boolean; now: string }
  | { type: "toggle-mark"; activityId: string; kind: "bingo" | "mission"; itemId: string }
  | { type: "connect"; otherUserId: string; activityId: string; now: string }
  | {
      type: "feedback";
      activityId: string;
      hostRating: number;
      eventRating: number;
      belonging: number;
      note: string;
      safetyConcern: boolean;
      now: string;
    }
  | { type: "create-activity"; draft: import("./types").ActivityDraft; activityId: string; venueId: string; conversationId: string; now: string }
  | { type: "update-activity"; activityId: string; patch: Partial<Activity>; venuePatch?: Partial<import("./types").Venue>; now: string }
  | { type: "cancel-activity"; activityId: string; now: string }
  | { type: "announce"; activityId: string; body: string; now: string }
  | { type: "repeat-activity"; activityId: string; activityIdNew: string; venueId: string; conversationId: string; now: string }
  | { type: "report"; targetUserId: string | null; activityId: string | null; reason: string; details: string; now: string }
  | { type: "block"; userId: string; now: string }
  | { type: "unblock"; userId: string }
  | { type: "verification"; kind: "phone" | "identity"; status: "pending" | "verified"; now: string }
  | { type: "trusted-contact"; name: string; phone: string }
  | { type: "opt-women-only"; value: boolean };

function withToast(state: AppState, tone: Toast["tone"], message: string): AppState {
  return { ...state, toast: { tone, message } };
}

function pushNotice(state: AppState, notice: NoticeInput): AppState {
  return {
    ...state,
    notices: [{ id: createId("note"), read: false, ...notice }, ...state.notices],
  };
}

function me(state: AppState) {
  return state.users.find((user) => user.id === state.sessionUserId) ?? null;
}

function upsertRsvp(rsvps: RSVP[], activityId: string, userId: string, status: RsvpStatus, now: string): RSVP[] {
  const index = rsvps.findIndex((item) => item.activityId === activityId && item.userId === userId);
  if (index === -1) {
    return [...rsvps, { id: createId("rsvp"), activityId, userId, status, createdAt: now, enRoute: false }];
  }
  return rsvps.map((item, itemIndex) =>
    itemIndex === index ? { ...item, status, enRoute: status === "going" ? item.enRoute : false } : item,
  );
}

function activityConversation(state: AppState, activityId: string) {
  return state.conversations.find((item) => item.activityId === activityId) ?? null;
}

function withMember(conversations: Conversation[], conversationId: string, userId: string) {
  return conversations.map((conversation) =>
    conversation.id === conversationId && !conversation.memberIds.includes(userId)
      ? { ...conversation, memberIds: [...conversation.memberIds, userId] }
      : conversation,
  );
}

function ensureChecklist(state: AppState, activityId: string, userId: string): AppState {
  if (state.checklists.some((item) => item.activityId === activityId && item.userId === userId)) return state;
  return {
    ...state,
    checklists: [
      ...state.checklists,
      {
        id: createId("check"),
        activityId,
        userId,
        items: CHECKLIST_LABELS.map((label) => ({ id: createId("item"), label, done: false })),
      },
    ],
  };
}

function post(state: AppState, conversationId: string, message: Omit<Message, "id" | "reactions" | "conversationId">): AppState {
  return {
    ...state,
    messages: [
      ...state.messages,
      { ...message, id: createId("msg"), conversationId, reactions: [] },
    ],
  };
}

function promote(state: AppState, activityId: string, now: string): AppState {
  const activity = state.activities.find((item) => item.id === activityId);
  if (!activity || activity.status === "cancelled") return state;
  let next = state;
  while (spotsLeft(activity, next.rsvps) > 0) {
    const waiting = next.waitlist
      .filter((item) => item.activityId === activityId)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const first = waiting[0];
    if (!first) break;
    next = {
      ...next,
      waitlist: next.waitlist.filter((item) => item.id !== first.id),
      rsvps: upsertRsvp(next.rsvps, activityId, first.userId, "going", now),
    };
    const conversation = activityConversation(next, activityId);
    if (conversation) next = { ...next, conversations: withMember(next.conversations, conversation.id, first.userId) };
    next = ensureChecklist(next, activityId, first.userId);
    const person = next.users.find((user) => user.id === first.userId);
    next = pushNotice(next, {
      userId: first.userId,
      title: "A place opened",
      body: `You're in for ${activity.title}. The group room is open.`,
      href: `/activity/${activityId}/room`,
      kind: "waitlist",
      createdAt: now,
    });
    if (conversation && person) {
      next = post(next, conversation.id, {
        senderId: null,
        kind: "system",
        body: `${person.name} joined from the waitlist.`,
        createdAt: now,
        parentId: null,
      });
    }
  }
  return next;
}

function goingSideEffects(state: AppState, activityId: string, userId: string, now: string, system: string): AppState {
  const activity = state.activities.find((item) => item.id === activityId);
  let next = ensureChecklist(state, activityId, userId);
  const conversation = activityConversation(next, activityId);
  if (conversation) {
    next = { ...next, conversations: withMember(next.conversations, conversation.id, userId) };
    next = post(next, conversation.id, { senderId: null, kind: "system", body: system, createdAt: now, parentId: null });
  }
  const preference = next.preferences.find((item) => item.userId === userId);
  if (activity && preference?.reminderHours && new Date(activity.startsAt).getTime() > new Date(now).getTime()) {
    next = pushNotice(next, {
      userId,
      title: "Reminder set",
      body: `We'll nudge you ${preference.reminderHours} hours before ${activity.title}.`,
      href: `/activity/${activityId}`,
      kind: "reminder",
      createdAt: now,
    });
  }
  return next;
}

export function reduce(state: AppState, action: Action): AppState {
  const viewer = me(state);

  switch (action.type) {
    case "hydrate":
      return action.state.schemaVersion === SCHEMA_VERSION ? action.state : state;
    case "sign-in":
      return state.users.some((user) => user.id === action.userId) ? { ...state, sessionUserId: action.userId, toast: null } : state;
    case "sign-out":
      return { ...state, sessionUserId: null, toast: null };
    case "complete-onboarding": {
      const exists = state.users.some((user) => user.id === action.user.id);
      return {
        ...state,
        sessionUserId: action.user.id,
        users: exists ? state.users.map((user) => (user.id === action.user.id ? action.user : user)) : [...state.users, action.user],
        preferences: [
          ...state.preferences.filter((item) => item.userId !== action.user.id),
          action.preference,
        ],
        verifications: [
          ...state.verifications.filter((item) => !(item.userId === action.user.id && item.kind === "email")),
          { id: createId("ver"), userId: action.user.id, kind: "email", status: "verified", updatedAt: action.preference.guidelinesAcceptedAt ?? new Date().toISOString() },
        ],
        toast: { tone: "good", message: "You're in. Start with one small plan." },
      };
    }
    case "update-preference":
      return {
        ...state,
        preferences: state.preferences.map((item) => (item.userId === action.preference.userId ? action.preference : item)),
        toast: { tone: "good", message: "Preferences saved." },
      };
    case "toggle-save": {
      if (!viewer) return state;
      const saved = state.saved.some((item) => item.userId === viewer.id && item.activityId === action.activityId);
      return {
        ...state,
        saved: saved
          ? state.saved.filter((item) => !(item.userId === viewer.id && item.activityId === action.activityId))
          : [...state.saved, { userId: viewer.id, activityId: action.activityId }],
      };
    }
    case "set-filters":
      return { ...state, filters: action.filters };
    case "clear-toast":
      return state.toast ? { ...state, toast: null } : state;
    case "read-notices": {
      if (!viewer) return state;
      if (state.notices.every((notice) => notice.userId !== viewer.id || notice.read)) return state;
      return {
        ...state,
        notices: state.notices.map((notice) => (notice.userId === viewer.id ? { ...notice, read: true } : notice)),
      };
    }
    case "read-conversation": {
      if (!viewer) return state;
      const exists = state.reads.some((item) => item.conversationId === action.conversationId && item.userId === viewer.id);
      return {
        ...state,
        reads: exists
          ? state.reads.map((item) =>
              item.conversationId === action.conversationId && item.userId === viewer.id
                ? { ...item, lastReadAt: action.now }
                : item,
            )
          : [...state.reads, { conversationId: action.conversationId, userId: viewer.id, lastReadAt: action.now }],
      };
    }
    case "join": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity || activity.status === "cancelled") return withToast(state, "error", "This gathering isn't open.");
      if (activity.hostId === viewer.id) return withToast(state, "info", "You're hosting this one.");
      if (activity.audience === "women-only" && !viewer.includeWomenOnly) {
        return withToast(state, "info", "This gathering is women-only. Opt in from Settings if that includes you.");
      }
      const current = rsvpFor(state, activity.id, viewer.id);
      if (current && ["pending", "going", "checked-in", "attended"].includes(current.status)) {
        return withToast(state, "info", "You're already in this gathering.");
      }
      if (state.waitlist.some((item) => item.activityId === activity.id && item.userId === viewer.id)) {
        return withToast(state, "info", "You're already on the waitlist.");
      }
      if (activity.audience === "private" && current?.status !== "invited") {
        return withToast(state, "error", "This gathering is invite-only.");
      }
      if (activity.audience === "approval" && current?.status !== "invited") {
        const next = {
          ...state,
          rsvps: upsertRsvp(state.rsvps, activity.id, viewer.id, "pending", action.now),
        };
        return withToast(
          pushNotice(next, {
            userId: activity.hostId,
            title: "Request to join",
            body: `${viewer.name} asked to join ${activity.title}.`,
            href: `/host/${activity.id}`,
            kind: "host",
            createdAt: action.now,
          }),
          "good",
          "Request sent. The exact meeting point stays hidden until the host confirms.",
        );
      }
      if (spotsLeft(activity, state.rsvps) <= 0) {
        return withToast(
          {
            ...state,
            waitlist: [
              ...state.waitlist,
              { id: createId("wait"), activityId: activity.id, userId: viewer.id, createdAt: action.now },
            ],
          },
          "info",
          "It's full. You're on the waitlist, and you'll move up automatically if someone cancels.",
        );
      }
      let next: AppState = {
        ...state,
        rsvps: upsertRsvp(state.rsvps, activity.id, viewer.id, "going", action.now),
        waitlist: state.waitlist.filter((item) => !(item.activityId === activity.id && item.userId === viewer.id)),
      };
      next = goingSideEffects(next, activity.id, viewer.id, action.now, `${viewer.name} joined the gathering.`);
      return withToast(next, "good", "You're in. The group room is open, and a place is saved for you.");
    }
    case "leave": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity) return state;
      if (activity.hostId === viewer.id) return withToast(state, "info", "Hosts cancel the whole gathering from the dashboard.");
      const waiting = state.waitlist.some((item) => item.activityId === activity.id && item.userId === viewer.id);
      if (waiting) {
        return withToast(
          { ...state, waitlist: state.waitlist.filter((item) => !(item.activityId === activity.id && item.userId === viewer.id)) },
          "info",
          "You left the waitlist.",
        );
      }
      const current = rsvpFor(state, activity.id, viewer.id);
      if (!current || current.status === "cancelled") return state;
      let next: AppState = { ...state, rsvps: upsertRsvp(state.rsvps, activity.id, viewer.id, "cancelled", action.now) };
      const conversation = activityConversation(next, activity.id);
      if (conversation && ["going", "pending", "checked-in"].includes(current.status)) {
        next = post(next, conversation.id, {
          senderId: null,
          kind: "system",
          body: `${viewer.name} cancelled. Their place is free.`,
          createdAt: action.now,
          parentId: null,
        });
      }
      if (["going", "pending", "checked-in"].includes(current.status)) next = promote(next, activity.id, action.now);
      return withToast(next, "info", "You cancelled. If someone was waiting, they have your place.");
    }
    case "approve":
    case "decline": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity || activity.hostId !== viewer.id) return withToast(state, "error", "Only the host can do that.");
      const current = rsvpFor(state, activity.id, action.userId);
      if (!current || current.status !== "pending") return state;
      const person = state.users.find((user) => user.id === action.userId);
      if (action.type === "decline") {
        let next: AppState = { ...state, rsvps: upsertRsvp(state.rsvps, activity.id, action.userId, "cancelled", action.now) };
        next = pushNotice(next, {
          userId: action.userId,
          title: "No place this time",
          body: `${activity.title} doesn't have a place for you this round. Your request stays private.`,
          href: "/discover",
          kind: "rsvp",
          createdAt: action.now,
        });
        next = promote(next, activity.id, action.now);
        return withToast(next, "info", `Closed ${person?.name ?? "the request"} privately.`);
      }
      let next: AppState = { ...state, rsvps: upsertRsvp(state.rsvps, activity.id, action.userId, "going", action.now) };
      next = goingSideEffects(next, activity.id, action.userId, action.now, `${person?.name ?? "A guest"} was confirmed by the host.`);
      next = pushNotice(next, {
        userId: action.userId,
        title: "You're confirmed",
        body: `${activity.title} is yours. The meeting point is now in the activity.`,
        href: `/activity/${activity.id}`,
        kind: "rsvp",
        createdAt: action.now,
      });
      return withToast(next, "good", `${person?.name ?? "Guest"} is confirmed.`);
    }
    case "check-in":
    case "host-check-in": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity) return state;
      const targetId = action.type === "host-check-in" ? action.userId : viewer.id;
      if (action.type === "host-check-in" && viewer.id !== activity.hostId) return withToast(state, "error", "Only the host can mark arrivals.");
      if (!checkInOpen(activity, new Date(action.now))) return withToast(state, "info", "Check-in opens 20 minutes before the start.");
      const current = rsvpFor(state, activity.id, targetId);
      if (!current || !["going", "checked-in"].includes(current.status)) return withToast(state, "error", "Join the gathering before checking in.");
      if (current.status === "checked-in") return withToast(state, "info", "Already checked in.");
      const next: AppState = {
        ...state,
        rsvps: upsertRsvp(state.rsvps, activity.id, targetId, "checked-in", action.now),
        checkIns: [...state.checkIns, { id: createId("in"), activityId: activity.id, userId: targetId, method: action.type === "host-check-in" ? "host" : "self", createdAt: action.now }],
      };
      return withToast(
        next,
        "good",
        action.type === "host-check-in" ? "Marked as arrived." : "You're marked here. The games stay optional.",
      );
    }
    case "check-in-code": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity || viewer.id !== activity.hostId) return withToast(state, "error", "Only the host can confirm a code.");
      if (!checkInOpen(activity, new Date(action.now))) return withToast(state, "info", "Check-in isn't open yet.");
      const match = state.rsvps.find(
        (item) =>
          item.activityId === activity.id &&
          item.status === "going" &&
          checkInCode(activity.id, item.userId).toLowerCase() === action.code.trim().toLowerCase(),
      );
      if (!match) return withToast(state, "error", "That code doesn't match someone still due to arrive.");
      return reduce(state, { type: "host-check-in", activityId: activity.id, userId: match.userId, now: action.now });
    }
    case "en-route": {
      if (!viewer) return state;
      const current = rsvpFor(state, action.activityId, viewer.id);
      if (!current || current.status !== "going") return withToast(state, "info", "You can send this once you're confirmed.");
      const conversation = activityConversation(state, action.activityId);
      let next: AppState = {
        ...state,
        rsvps: state.rsvps.map((item) => (item.id === current.id ? { ...item, enRoute: true } : item)),
      };
      if (conversation) {
        next = post(next, conversation.id, {
          senderId: viewer.id,
          kind: "enroute",
          body: `${viewer.name} is on the way.`,
          createdAt: action.now,
          parentId: null,
        });
      }
      return withToast(next, "good", "The group knows you're on the way.");
    }
    case "send-message": {
      if (!viewer) return state;
      const body = action.body.trim();
      if (!body) return state;
      const conversation = state.conversations.find((item) => item.id === action.conversationId);
      if (!conversation || !conversation.memberIds.includes(viewer.id)) return withToast(state, "error", "You can't post in this room yet.");
      return post(state, conversation.id, {
        senderId: viewer.id,
        kind: "text",
        body,
        createdAt: action.now,
        parentId: action.parentId,
      });
    }
    case "react": {
      if (!viewer) return state;
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.id !== action.messageId) return message;
          const exists = message.reactions.some((reaction) => reaction.userId === viewer.id && reaction.emoji === action.emoji);
          return {
            ...message,
            reactions: exists
              ? message.reactions.filter((reaction) => !(reaction.userId === viewer.id && reaction.emoji === action.emoji))
              : [...message.reactions, { userId: viewer.id, emoji: action.emoji }],
          };
        }),
      };
    }
    case "vote": {
      if (!viewer) return state;
      const poll = state.polls.find((item) => item.id === action.pollId);
      if (!poll) return state;
      const optionOk = state.pollOptions.some((item) => item.id === action.optionId && item.pollId === poll.id);
      if (!optionOk) return state;
      const current = rsvpFor(state, poll.activityId, viewer.id);
      const activity = state.activities.find((item) => item.id === poll.activityId);
      const allowed = activity?.hostId === viewer.id || (current != null && ["going", "checked-in", "attended", "pending"].includes(current.status));
      if (!allowed) return withToast(state, "info", "Join the gathering to vote.");
      return {
        ...state,
        pollVotes: [
          ...state.pollVotes.filter((item) => !(item.pollId === poll.id && item.userId === viewer.id)),
          { id: createId("vote"), pollId: poll.id, optionId: action.optionId, userId: viewer.id, createdAt: action.now },
        ],
      };
    }
    case "create-poll": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity || activity.hostId !== viewer.id) return withToast(state, "error", "Only the host can open a poll.");
      const options = action.options.map((label) => label.trim()).filter(Boolean);
      if (!action.question.trim() || options.length < 2) return withToast(state, "error", "Add a question and at least two choices.");
      const pollId = createId("poll");
      return withToast(
        {
          ...state,
          polls: [...state.polls, { id: pollId, activityId: activity.id, authorId: viewer.id, question: action.question.trim(), createdAt: action.now, live: action.live }],
          pollOptions: [...state.pollOptions, ...options.map((label) => ({ id: createId("opt"), pollId, label }))],
        },
        "good",
        "Poll is open.",
      );
    }
    case "answer-prompt": {
      if (!viewer) return state;
      const body = action.body.trim();
      if (!body) return state;
      const prompt = state.prompts.find((item) => item.id === action.promptId);
      if (!prompt) return state;
      const existing = state.promptAnswers.find((item) => item.promptId === prompt.id && item.userId === viewer.id);
      const answers = existing
        ? state.promptAnswers.map((item) => (item.id === existing.id ? { ...item, body, createdAt: action.now } : item))
        : [...state.promptAnswers, { id: createId("ans"), promptId: prompt.id, userId: viewer.id, body, createdAt: action.now }];
      return { ...state, promptAnswers: answers };
    }
    case "add-suggestion": {
      if (!viewer) return state;
      const title = action.title.trim();
      if (!title) return state;
      return {
        ...state,
        suggestions: [...state.suggestions, { id: createId("sug"), activityId: action.activityId, userId: viewer.id, title, createdAt: action.now }],
      };
    }
    case "toggle-checklist": {
      if (!viewer) return state;
      return {
        ...state,
        checklists: state.checklists.map((list) =>
          list.activityId === action.activityId && list.userId === viewer.id
            ? { ...list, items: list.items.map((item) => (item.id === action.itemId ? { ...item, done: !item.done } : item)) }
            : list,
        ),
      };
    }
    case "pulse": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity || phaseOf(activity, new Date(action.now)) !== "live") return withToast(state, "info", "The pulse is open while the gathering is happening.");
      const existing = state.pulses.find((item) => item.activityId === activity.id && item.userId === viewer.id);
      const pulses = existing
        ? state.pulses.map((item) => (item === existing ? { ...item, value: action.value, updatedAt: action.now } : item))
        : [...state.pulses, { activityId: activity.id, userId: viewer.id, value: action.value, updatedAt: action.now }];
      let next: AppState = { ...state, pulses };
      if (action.value === "help") {
        next = pushNotice(next, {
          userId: activity.hostId,
          title: "Someone needs the host",
          body: `The pulse on ${activity.title} says a guest needs help. It stays anonymous.`,
          href: `/host/${activity.id}`,
          kind: "host",
          createdAt: action.now,
        });
      }
      return withToast(next, "good", action.value === "help" ? "The host got an anonymous nudge." : "Pulse saved. The host sees the count, not your name.");
    }
    case "share-location": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity?.modules.locationShare) return withToast(state, "info", "This gathering doesn't use location sharing.");
      const current = rsvpFor(state, activity.id, viewer.id);
      if (action.on && current?.status !== "checked-in") return withToast(state, "info", "Check in first, then you can share an approximate area.");
      const others = state.locationShares.filter((item) => !(item.activityId === activity.id && item.userId === viewer.id));
      return {
        ...state,
        locationShares: action.on ? [...others, { activityId: activity.id, userId: viewer.id, active: true, updatedAt: action.now }] : others,
        toast: { tone: "info", message: action.on ? "Sharing your approximate area with people who checked in." : "Location sharing is off." },
      };
    }
    case "toggle-mark": {
      if (!viewer) return state;
      const exists = state.gameMarks.some(
        (item) => item.activityId === action.activityId && item.userId === viewer.id && item.kind === action.kind && item.itemId === action.itemId,
      );
      return {
        ...state,
        gameMarks: exists
          ? state.gameMarks.filter(
              (item) =>
                !(item.activityId === action.activityId && item.userId === viewer.id && item.kind === action.kind && item.itemId === action.itemId),
            )
          : [...state.gameMarks, { activityId: action.activityId, userId: viewer.id, kind: action.kind, itemId: action.itemId }],
      };
    }
    case "connect": {
      if (!viewer) return state;
      if (viewer.id === action.otherUserId) return state;
      if (blockedBy(state, viewer.id, action.otherUserId) || blockedBy(state, action.otherUserId, viewer.id)) {
        return withToast(state, "info", "Connection isn't available with someone you've blocked.");
      }
      const alreadyMutual = state.connections.some(
        (item) =>
          (item.userAId === viewer.id && item.userBId === action.otherUserId) ||
          (item.userAId === action.otherUserId && item.userBId === viewer.id),
      );
      if (alreadyMutual) return withToast(state, "info", "You're already connected.");
      const mine = state.connectionRequests.some(
        (item) => item.fromUserId === viewer.id && item.toUserId === action.otherUserId && item.activityId === action.activityId,
      );
      if (mine) return withToast(state, "info", "Saved privately. Nothing is sent unless they choose you too.");
      const other = state.users.find((user) => user.id === action.otherUserId);
      const reverse = state.connectionRequests.some(
        (item) => item.fromUserId === action.otherUserId && item.toUserId === viewer.id && item.activityId === action.activityId,
      );
      let next: AppState = {
        ...state,
        connectionRequests: [
          ...state.connectionRequests,
          { id: createId("req"), activityId: action.activityId, fromUserId: viewer.id, toUserId: action.otherUserId, createdAt: action.now },
        ],
      };
      if (!reverse) return withToast(next, "good", "Saved privately. They'll only know if they choose you too.");
      const conversationId = createId("conv");
      next = {
        ...next,
        connections: [
          ...next.connections,
          { id: createId("con"), userAId: viewer.id, userBId: action.otherUserId, activityId: action.activityId, createdAt: action.now },
        ],
        conversations: [
          ...next.conversations,
          {
            id: conversationId,
            kind: "direct",
            activityId: action.activityId,
            communityId: null,
            memberIds: [viewer.id, action.otherUserId],
            title: other ? `${viewer.name} and ${other.name}` : "Connection",
          },
        ],
      };
      next = pushNotice(next, {
        userId: viewer.id,
        title: "It's mutual",
        body: `You and ${other?.name ?? "they"} both wanted to stay in touch.`,
        href: `/messages/${conversationId}`,
        kind: "connection",
        createdAt: action.now,
      });
      next = pushNotice(next, {
        userId: action.otherUserId,
        title: "It's mutual",
        body: `You and ${viewer.name} both wanted to stay in touch.`,
        href: `/messages/${conversationId}`,
        kind: "connection",
        createdAt: action.now,
      });
      return withToast(next, "good", `You and ${other?.name ?? "they"} both said yes.`);
    }
    case "feedback": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity) return state;
      if (state.reviews.some((item) => item.activityId === activity.id && item.authorId === viewer.id)) {
        return withToast(state, "info", "You already sent private feedback.");
      }
      let next: AppState = {
        ...state,
        reviews: [
          ...state.reviews,
          {
            id: createId("rev"),
            activityId: activity.id,
            authorId: viewer.id,
            hostId: activity.hostId,
            hostRating: action.hostRating,
            eventRating: action.eventRating,
            belonging: action.belonging,
            note: action.note.trim(),
            safetyConcern: action.safetyConcern,
            createdAt: action.now,
          },
        ],
      };
      if (action.safetyConcern) {
        next = {
          ...next,
          reports: [
            ...next.reports,
            {
              id: createId("rep"),
              reporterId: viewer.id,
              targetUserId: null,
              activityId: activity.id,
              reason: "Safety concern in private feedback",
              details: action.note.trim() || "Flagged from the private feedback form.",
              status: "open",
              createdAt: action.now,
            },
          ],
        };
      }
      return withToast(next, "good", "Feedback stays private. Safety notes go to moderation, not a public review.");
    }
    case "create-activity": {
      if (!viewer) return state;
      const draft = action.draft;
      if (draft.title.trim().length < 4) return withToast(state, "error", "Give the gathering a clearer title.");
      if (draft.capacity < 2 || draft.capacity > 16) return withToast(state, "error", "Capacity needs to sit between 2 and 16.");
      const place = neighborhood(draft.neighborhood);
      if (!place) return withToast(state, "error", "Choose a neighborhood.");
      const venue = {
        id: action.venueId,
        name: draft.placeName.trim() || draft.neighborhood,
        neighborhood: draft.neighborhood,
        city: "Dubai",
        areaLat: place.lat,
        areaLng: place.lng,
        exactLat: place.lat + (draft.audience === "public" ? 0.001 : 0.004),
        exactLng: place.lng + 0.001,
        exactAddress: draft.exactAddress.trim() || `${draft.neighborhood}, exact point shared after you join`,
        meetingNote: "Look for the host and a small Gatherly note on the table or at the entrance.",
      };
      const activity: Activity = {
        id: action.activityId,
        communityId: draft.communityId,
        hostId: viewer.id,
        venueId: venue.id,
        title: draft.title.trim(),
        description: draft.description.trim(),
        type: draft.type,
        cover: draft.cover,
        startsAt: draft.startsAt,
        durationMin: draft.durationMin,
        capacity: draft.capacity,
        price: Math.max(0, draft.price),
        currency: "AED",
        energy: draft.energy,
        languages: draft.languages,
        accessibility: draft.accessibility,
        experience: draft.experience,
        audience: draft.audience,
        tags: draft.tags,
        modules: draft.modules,
        guidelines: ["Be kind to people who came alone.", "Cancel if you can't come.", "Ask before you photograph someone."],
        cancellationPolicy: "Cancel in the app any time before the start. The place goes to the first person waiting.",
        status: "scheduled",
      };
      let next: AppState = {
        ...state,
        venues: [...state.venues, venue],
        activities: [...state.activities, activity],
        rsvps: upsertRsvp(state.rsvps, activity.id, viewer.id, "going", action.now),
        conversations: [
          ...state.conversations,
          { id: action.conversationId, kind: "activity", activityId: activity.id, communityId: null, memberIds: [viewer.id], title: activity.title },
        ],
        prompts: [
          ...state.prompts,
          ...DEFAULT_PROMPTS.map((prompt) => ({ id: createId("prompt"), activityId: activity.id, prompt })),
        ],
      };
      next = ensureChecklist(next, activity.id, viewer.id);
      return withToast(next, "good", "Published. People can find it without joining a club first.");
    }
    case "update-activity": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity || activity.hostId !== viewer.id) return withToast(state, "error", "Only the host can edit this.");
      const capacity = action.patch.capacity ?? activity.capacity;
      if (capacity < occupyingCount(state.rsvps, activity.id)) {
        return withToast(state, "error", "Capacity can't drop below the people already confirmed.");
      }
      return withToast(
        {
          ...state,
          activities: state.activities.map((item) => (item.id === activity.id ? { ...item, ...action.patch, id: item.id, hostId: item.hostId } : item)),
          venues: action.venuePatch
            ? state.venues.map((venue) => (venue.id === activity.venueId ? { ...venue, ...action.venuePatch, id: venue.id } : venue))
            : state.venues,
        },
        "good",
        "Gathering updated.",
      );
    }
    case "cancel-activity": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      if (!activity || activity.hostId !== viewer.id) return withToast(state, "error", "Only the host can cancel.");
      if (activity.status === "cancelled") return state;
      let next: AppState = {
        ...state,
        activities: state.activities.map((item) => (item.id === activity.id ? { ...item, status: "cancelled" } : item)),
      };
      const people = new Set<string>([
        ...state.rsvps.filter((item) => item.activityId === activity.id && item.userId !== viewer.id && item.status !== "cancelled").map((item) => item.userId),
        ...state.waitlist.filter((item) => item.activityId === activity.id).map((item) => item.userId),
      ]);
      for (const userId of people) {
        next = pushNotice(next, {
          userId,
          title: "Gathering cancelled",
          body: `${activity.title} was cancelled by the host.`,
          href: "/discover",
          kind: "rsvp",
          createdAt: action.now,
        });
      }
      return withToast(next, "info", "Cancelled, and everyone involved was told.");
    }
    case "announce": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      const conversation = activityConversation(state, action.activityId);
      if (!activity || !conversation || activity.hostId !== viewer.id) return withToast(state, "error", "Only the host can announce.");
      const body = action.body.trim();
      if (!body) return state;
      let next = post(state, conversation.id, { senderId: viewer.id, kind: "announcement", body, createdAt: action.now, parentId: null });
      for (const userId of conversation.memberIds) {
        if (userId === viewer.id) continue;
        next = pushNotice(next, {
          userId,
          title: "Host note",
          body,
          href: `/activity/${activity.id}/room`,
          kind: "chat",
          createdAt: action.now,
        });
      }
      return withToast(next, "good", "Announcement sent to the group.");
    }
    case "repeat-activity": {
      if (!viewer) return state;
      const activity = state.activities.find((item) => item.id === action.activityId);
      const venue = state.venues.find((item) => item.id === activity?.venueId);
      if (!activity || !venue || activity.hostId !== viewer.id) return state;
      const starts = new Date(new Date(activity.startsAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const copy: Activity = { ...activity, id: action.activityIdNew, startsAt: starts, status: "scheduled", title: activity.title };
      let next: AppState = {
        ...state,
        venues: [...state.venues, { ...venue, id: action.venueId }],
        activities: [...state.activities, copy],
        rsvps: upsertRsvp(state.rsvps, copy.id, viewer.id, "going", action.now),
        conversations: [
          ...state.conversations,
          { id: action.conversationId, kind: "activity", activityId: copy.id, communityId: null, memberIds: [viewer.id], title: copy.title },
        ],
        prompts: [...state.prompts, ...DEFAULT_PROMPTS.map((prompt) => ({ id: createId("prompt"), activityId: copy.id, prompt }))],
      };
      next = ensureChecklist(next, copy.id, viewer.id);
      return withToast(next, "good", "Next week is drafted from this gathering.");
    }
    case "report": {
      if (!viewer) return state;
      if (action.reason.trim().length < 3) return withToast(state, "error", "Choose what happened.");
      return withToast(
        {
          ...state,
          reports: [
            ...state.reports,
            {
              id: createId("rep"),
              reporterId: viewer.id,
              targetUserId: action.targetUserId,
              activityId: action.activityId,
              reason: action.reason.trim(),
              details: action.details.trim(),
              status: "open",
              createdAt: action.now,
            },
          ],
        },
        "good",
        "Report received. It goes to moderation, not onto a public profile.",
      );
    }
    case "block": {
      if (!viewer || viewer.id === action.userId) return state;
      if (state.blocks.some((item) => item.userId === viewer.id && item.blockedUserId === action.userId)) {
        return withToast(state, "info", "Already blocked.");
      }
      return withToast(
        {
          ...state,
          blocks: [...state.blocks, { id: createId("block"), userId: viewer.id, blockedUserId: action.userId, createdAt: action.now }],
          connectionRequests: state.connectionRequests.filter(
            (item) =>
              !((item.fromUserId === viewer.id && item.toUserId === action.userId) || (item.fromUserId === action.userId && item.toUserId === viewer.id)),
          ),
        },
        "info",
        "Blocked. They are not notified.",
      );
    }
    case "unblock": {
      if (!viewer) return state;
      return {
        ...state,
        blocks: state.blocks.filter((item) => !(item.userId === viewer.id && item.blockedUserId === action.userId)),
        toast: { tone: "info", message: "Unblocked." },
      };
    }
    case "verification": {
      if (!viewer) return state;
      const users = state.users.map((user) => {
        if (user.id !== viewer.id) return user;
        if (action.kind === "phone") return { ...user, phoneVerified: action.status === "verified" };
        return {
          ...user,
          identityStatus: action.status,
          identityVerified: action.status === "verified",
        };
      });
      return withToast(
        {
          ...state,
          users,
          verifications: [
            ...state.verifications.filter((item) => !(item.userId === viewer.id && item.kind === action.kind)),
            { id: createId("ver"), userId: viewer.id, kind: action.kind, status: action.status, updatedAt: action.now },
          ],
        },
        "info",
        action.status === "pending" ? "Submitted for review." : "Verification updated for this demo.",
      );
    }
    case "trusted-contact": {
      if (!viewer) return state;
      return withToast(
        {
          ...state,
          users: state.users.map((user) =>
            user.id === viewer.id ? { ...user, trustedContact: { name: action.name.trim(), phone: action.phone.trim() } } : user,
          ),
        },
        "good",
        "Trusted contact saved on this device.",
      );
    }
    case "opt-women-only": {
      if (!viewer) return state;
      return {
        ...state,
        users: state.users.map((user) => (user.id === viewer.id ? { ...user, includeWomenOnly: action.value } : user)),
        toast: {
          tone: "info",
          message: action.value ? "Women-only gatherings can be joined from your account." : "Women-only gatherings stay visible, and join stays closed.",
        },
      };
    }
    default:
      return state;
  }
}

export function reducer(state: AppState | null, action: Action): AppState | null {
  if (action.type === "hydrate") return action.state.schemaVersion === SCHEMA_VERSION ? action.state : state;
  if (!state) return state;
  return reduce(state, action);
}
