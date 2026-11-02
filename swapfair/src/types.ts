import type { Copy } from "./copy";

export type Country = "AE" | "IN";
export type Currency = "AED" | "INR";
export type CategoryId =
  | "electronics"
  | "cameras"
  | "home"
  | "furniture"
  | "books"
  | "kids"
  | "services"
  | "fashion"
  | "sports"
  | "music";

export type Handoff = "meetup" | "pickup" | "delivery" | "shipping";
export type Rank = "preferred" | "consider" | "no";

export type Screen =
  | "landing"
  | "auth"
  | "country"
  | "onboarding"
  | "verify"
  | "identity"
  | "home"
  | "search"
  | "map"
  | "category"
  | "listing"
  | "create"
  | "manage"
  | "matches"
  | "profile"
  | "favorites"
  | "saved"
  | "proposal"
  | "offer"
  | "compare"
  | "messages"
  | "trades"
  | "thread"
  | "workspace"
  | "schedule"
  | "checkin"
  | "complete"
  | "review"
  | "report"
  | "dispute"
  | "notifications"
  | "settings"
  | "safety"
  | "policy"
  | "admin"
  | "design"
  | "states";

export type Phase =
  | "guest"
  | "onboarding"
  | "verified"
  | "listed"
  | "sent"
  | "countered"
  | "accepted"
  | "scheduled"
  | "checkedin"
  | "awaiting"
  | "completed"
  | "reviewed";

export type Scenario =
  | null
  | "prohibited-listing"
  | "prohibited-counter"
  | "unavailable"
  | "significant-diff"
  | "report-counterfeit"
  | "meetup-cancelled"
  | "disputed"
  | "restricted"
  | "under-review"
  | "rejected"
  | "location-denied"
  | "network"
  | "upload-failed";

export type TradeStatus =
  | "proposed"
  | "countered"
  | "accepted"
  | "scheduling"
  | "scheduled"
  | "inprogress"
  | "awaiting"
  | "completed"
  | "cancelled"
  | "disputed"
  | "declined"
  | "withdrawn";

export type Person = {
  id: string;
  name: Copy;
  short: Copy;
  initials: Copy;
  country: Country;
  city: string;
  area: string;
  since: string;
  phone: boolean;
  email: boolean;
  identity: boolean;
  identityNote: Copy;
  trades: number;
  rating: number;
  reviews: number;
  accuracy: number;
  communication: number;
  reliability: number;
  response: Copy;
  cancellation: Copy;
  bio: Copy;
  wishlist: Copy;
  languages: Copy;
  tone: string;
};

export type Listing = {
  id: string;
  ownerId: string;
  title: Copy;
  category: CategoryId;
  kind: "item" | "service";
  value: number;
  currency: Currency;
  condition: Copy;
  country: Country;
  city: string;
  area: string;
  km: number;
  posted: Copy;
  days: number;
  wants: Copy;
  wantTags: CategoryId[];
  cashOk: boolean;
  bundlesOk: boolean;
  negotiable: boolean;
  open: boolean;
  art: string;
  description: Copy;
  defects: Copy;
  specs: { label: Copy; value: Copy }[];
  handoff: Handoff[];
  handoffNote: Copy;
  unlisted?: boolean;
  committed?: boolean;
  guidance?: Copy;
  suspicious?: boolean;
  pin?: { x: number; y: number };
};

export type LineItem = {
  id: string;
  title: Copy;
  value: number;
};

export type Version = {
  n: number;
  sender: "me" | "them";
  at: string;
  your: LineItem[];
  their: LineItem[];
  yourCash: number;
  theirCash: number;
  place: string;
  method: Handoff;
  date: string;
  note: string;
};

export type Draft = {
  yourIds: string[];
  theirIds: string[];
  values: Record<string, number>;
  yourCash: number;
  theirCash: number;
  message: string;
  place: string;
  date: string;
  method: Handoff;
  conditions: string;
  request: string;
  ack: boolean;
  mode: "new" | "counter";
};

export type Wish = { text: string; rank: Rank };

export type CreateDraft = {
  step: number;
  kind: "item" | "service";
  title: string;
  description: string;
  category: CategoryId;
  condition: string;
  brand: string;
  age: string;
  defects: string;
  owned: boolean;
  value: string;
  negotiable: boolean;
  ackValue: boolean;
  wishes: Wish[];
  specific: string;
  cashOk: boolean;
  bundlesOk: boolean;
  open: boolean;
  meetup: boolean;
  pickup: boolean;
  delivery: boolean;
  shipping: boolean;
  radius: number;
  availability: string;
  photos: number;
  stockBlocked: boolean;
  outcome: "idle" | "allowed" | "review" | "prohibited";
  editing: boolean;
};

export type ChatMessage = {
  id: string;
  from: "me" | "them" | "system";
  kind: "text" | "listing" | "offer" | "counter" | "meetup" | "warning";
  text: string;
  textCopy?: Copy;
  listingId?: string;
  version?: number;
  warning?: Copy;
  at: string;
};

export type SavedSearch = {
  id: string;
  title: Copy;
  category: CategoryId | "any";
  max?: number;
  updates: number;
};

export type SearchQuery = {
  text: string;
  category: CategoryId | "any";
  kind: "any" | "item" | "service";
  city: string;
  distance: number;
  min: number;
  max: number;
  condition: string;
  handoff: Handoff | "any";
  cash: boolean;
  bundles: boolean;
  verified: boolean;
  days: number;
  have: boolean;
  want: boolean;
};

export type MeetupPlan = {
  place: string;
  date: string;
  method: Handoff;
  whoPays: string;
  trustedName: string;
  trustedPhone: string;
};

export type NotifPrefs = Record<string, { push: boolean; email: boolean; inapp: boolean }>;

export type Story = {
  phase: Phase;
  listingId: string;
  profileId: string;
  categoryId: CategoryId;
  favorites: string[];
  recent: string[];
  draft: Draft;
  versions: Version[];
  outcome: "open" | "declined" | "withdrawn";
  locked: number | null;
  meetup: MeetupPlan | null;
  meConfirmed: boolean;
  themConfirmed: boolean;
  reviewDone: boolean;
  checkedIn: boolean;
  checkinEnds: number | null;
  create: CreateDraft;
  onboardStep: number;
  have: CategoryId[];
  want: CategoryId[];
  radius: number;
  city: string;
  area: string;
  threadId: string;
  threads: Record<string, ChatMessage[]>;
  reportId: string | null;
  disputeId: string | null;
  disputeReason: string;
  scenario: Scenario;
  blocked: string[];
  saved: SavedSearch[];
  search: SearchQuery;
  view: "grid" | "map";
  authMode: "signup" | "signin";
  notif: NotifPrefs;
  bio: string;
  paused: boolean;
};

export type BalanceKind = "balanced" | "small" | "significant" | "accepted";

export type PolicyHit = {
  outcome: "allowed" | "review" | "prohibited";
  category: Copy | null;
  message: Copy | null;
};
