"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import { createSeed } from "@/lib/seed";
import { createId, reducer, type Action } from "@/lib/reducer";
import { SCHEMA_VERSION, type ActivityDraft, type AppState, type User, type UserPreference } from "@/lib/types";
import { Splash } from "./ui";

const STORAGE_KEY = "gatherly-state-v1";

type Api = {
  signIn: (userId: string) => void;
  signOut: () => void;
  completeOnboarding: (user: User, preference: UserPreference) => void;
  updatePreference: (preference: UserPreference) => void;
  toggleSave: (activityId: string) => void;
  setFilters: (filters: AppState["filters"]) => void;
  clearToast: () => void;
  readNotices: () => void;
  readConversation: (conversationId: string) => void;
  join: (activityId: string) => void;
  leave: (activityId: string) => void;
  approve: (activityId: string, userId: string) => void;
  decline: (activityId: string, userId: string) => void;
  checkIn: (activityId: string) => void;
  hostCheckIn: (activityId: string, userId: string) => void;
  checkInCode: (activityId: string, code: string) => void;
  enRoute: (activityId: string) => void;
  sendMessage: (conversationId: string, body: string, parentId?: string | null) => void;
  react: (messageId: string, emoji: string) => void;
  vote: (pollId: string, optionId: string) => void;
  createPoll: (activityId: string, question: string, options: string[], live?: boolean) => void;
  answerPrompt: (promptId: string, body: string) => void;
  addSuggestion: (activityId: string, title: string) => void;
  toggleChecklist: (activityId: string, itemId: string) => void;
  pulse: (activityId: string, value: "great" | "okay" | "help") => void;
  shareLocation: (activityId: string, on: boolean) => void;
  toggleMark: (activityId: string, kind: "bingo" | "mission", itemId: string) => void;
  connect: (otherUserId: string, activityId: string) => void;
  feedback: (input: {
    activityId: string;
    hostRating: number;
    eventRating: number;
    belonging: number;
    note: string;
    safetyConcern: boolean;
  }) => void;
  createActivity: (draft: ActivityDraft) => string;
  updateActivity: (activityId: string, patch: Partial<AppState["activities"][number]>, venuePatch?: Partial<AppState["venues"][number]>) => void;
  cancelActivity: (activityId: string) => void;
  announce: (activityId: string, body: string) => void;
  repeatActivity: (activityId: string) => string;
  report: (input: { targetUserId: string | null; activityId: string | null; reason: string; details: string }) => void;
  block: (userId: string) => void;
  unblock: (userId: string) => void;
  verification: (kind: "phone" | "identity", status: "pending" | "verified") => void;
  trustedContact: (name: string, phone: string) => void;
  optWomenOnly: (value: boolean) => void;
  reset: () => void;
};

const Ctx = createContext<{ state: AppState; api: Api } | null>(null);

export function Providers({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        if (parsed.schemaVersion === SCHEMA_VERSION && Array.isArray(parsed.users) && parsed.users.length > 0) {
          dispatch({ type: "hydrate", state: { ...parsed, toast: null } });
          setReady(true);
          return;
        }
      }
    } catch {
      /* Keep the seeded city if a previous demo save is unreadable. */
    }
    dispatch({ type: "hydrate", state: createSeed(new Date()) });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, toast: null }));
  }, [ready, state]);

  const api = useMemo<Api>(() => {
    const now = () => new Date().toISOString();
    const send = (action: Action) => dispatch(action);
    return {
      signIn: (userId) => send({ type: "sign-in", userId }),
      signOut: () => send({ type: "sign-out" }),
      completeOnboarding: (user, preference) => send({ type: "complete-onboarding", user, preference }),
      updatePreference: (preference) => send({ type: "update-preference", preference }),
      toggleSave: (activityId) => send({ type: "toggle-save", activityId }),
      setFilters: (filters) => send({ type: "set-filters", filters }),
      clearToast: () => send({ type: "clear-toast" }),
      readNotices: () => send({ type: "read-notices" }),
      readConversation: (conversationId) => send({ type: "read-conversation", conversationId, now: now() }),
      join: (activityId) => send({ type: "join", activityId, now: now() }),
      leave: (activityId) => send({ type: "leave", activityId, now: now() }),
      approve: (activityId, userId) => send({ type: "approve", activityId, userId, now: now() }),
      decline: (activityId, userId) => send({ type: "decline", activityId, userId, now: now() }),
      checkIn: (activityId) => send({ type: "check-in", activityId, now: now() }),
      hostCheckIn: (activityId, userId) => send({ type: "host-check-in", activityId, userId, now: now() }),
      checkInCode: (activityId, code) => send({ type: "check-in-code", activityId, code, now: now() }),
      enRoute: (activityId) => send({ type: "en-route", activityId, now: now() }),
      sendMessage: (conversationId, body, parentId = null) => send({ type: "send-message", conversationId, body, parentId, now: now() }),
      react: (messageId, emoji) => send({ type: "react", messageId, emoji }),
      vote: (pollId, optionId) => send({ type: "vote", pollId, optionId, now: now() }),
      createPoll: (activityId, question, options, live = false) => send({ type: "create-poll", activityId, question, options, live, now: now() }),
      answerPrompt: (promptId, body) => send({ type: "answer-prompt", promptId, body, now: now() }),
      addSuggestion: (activityId, title) => send({ type: "add-suggestion", activityId, title, now: now() }),
      toggleChecklist: (activityId, itemId) => send({ type: "toggle-checklist", activityId, itemId }),
      pulse: (activityId, value) => send({ type: "pulse", activityId, value, now: now() }),
      shareLocation: (activityId, on) => send({ type: "share-location", activityId, on, now: now() }),
      toggleMark: (activityId, kind, itemId) => send({ type: "toggle-mark", activityId, kind, itemId }),
      connect: (otherUserId, activityId) => send({ type: "connect", otherUserId, activityId, now: now() }),
      feedback: (input) => send({ type: "feedback", ...input, now: now() }),
      createActivity: (draft) => {
        const activityId = createId("act");
        send({ type: "create-activity", draft, activityId, venueId: createId("ven"), conversationId: createId("conv"), now: now() });
        return activityId;
      },
      updateActivity: (activityId, patch, venuePatch) => send({ type: "update-activity", activityId, patch, venuePatch, now: now() }),
      cancelActivity: (activityId) => send({ type: "cancel-activity", activityId, now: now() }),
      announce: (activityId, body) => send({ type: "announce", activityId, body, now: now() }),
      repeatActivity: (activityId) => {
        const activityIdNew = createId("act");
        send({
          type: "repeat-activity",
          activityId,
          activityIdNew,
          venueId: createId("ven"),
          conversationId: createId("conv"),
          now: now(),
        });
        return activityIdNew;
      },
      report: (input) => send({ type: "report", ...input, now: now() }),
      block: (userId) => send({ type: "block", userId, now: now() }),
      unblock: (userId) => send({ type: "unblock", userId }),
      verification: (kind, status) => send({ type: "verification", kind, status, now: now() }),
      trustedContact: (name, phone) => send({ type: "trusted-contact", name, phone }),
      optWomenOnly: (value) => send({ type: "opt-women-only", value }),
      reset: () => {
        localStorage.removeItem(STORAGE_KEY);
        send({ type: "hydrate", state: createSeed(new Date()) });
      },
    };
  }, []);

  const value = useMemo(() => (state ? { state, api } : null), [state, api]);

  if (!ready || !value) return <Splash />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Gatherly is still starting");
  return ctx;
}
