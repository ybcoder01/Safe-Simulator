export const SCHEMA_VERSION = 1;

export type Energy = "Relaxed" | "Lively" | "Focused";
export type Audience = "public" | "private" | "women-only" | "approval";
export type ActivityPhase = "upcoming" | "live" | "past" | "cancelled";
export type RsvpStatus =
  | "invited"
  | "pending"
  | "going"
  | "checked-in"
  | "attended"
  | "no-show"
  | "cancelled";

export type Experience = "Newcomer-friendly" | "Some experience" | "Bring your thing";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  neighborhood: string;
  lat: number;
  lng: number;
  headline: string;
  avatarHue: number;
  portrait: number;
  languages: string[];
  interests: string[];
  emailVerified: boolean;
  phoneVerified: boolean;
  identityVerified: boolean;
  identityStatus: "unverified" | "pending" | "verified";
  includeWomenOnly: boolean;
  memberSince: string;
  prompts: { prompt: string; answer: string }[];
  trustedContact: { name: string; phone: string } | null;
}

export interface UserPreference {
  userId: string;
  groupMin: number;
  groupMax: number;
  energy: Energy[];
  languages: string[];
  accessibilityNeeds: string[];
  prefersFree: boolean;
  maxPrice: number | null;
  guidelinesAcceptedAt: string | null;
  reminderHours: number | null;
}

export interface Verification {
  id: string;
  userId: string;
  kind: "email" | "phone" | "identity";
  status: "unverified" | "pending" | "verified";
  updatedAt: string;
}

export interface Venue {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  areaLat: number;
  areaLng: number;
  exactLat: number;
  exactLng: number;
  exactAddress: string;
  meetingNote: string;
}

export interface ActivityModules {
  chat: boolean;
  prompts: boolean;
  polls: boolean;
  board: boolean;
  icebreakers: boolean;
  liveGame: boolean;
  locationShare: boolean;
}

export interface Activity {
  id: string;
  communityId: string | null;
  hostId: string;
  venueId: string;
  title: string;
  description: string;
  type: string;
  cover: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  price: number;
  currency: "AED";
  energy: Energy;
  languages: string[];
  accessibility: string[];
  experience: Experience;
  audience: Audience;
  tags: string[];
  modules: ActivityModules;
  guidelines: string[];
  cancellationPolicy: string;
  status: "scheduled" | "cancelled";
}

export interface RSVP {
  id: string;
  activityId: string;
  userId: string;
  status: RsvpStatus;
  createdAt: string;
  enRoute: boolean;
}

export interface WaitlistEntry {
  id: string;
  activityId: string;
  userId: string;
  createdAt: string;
}

export interface Community {
  id: string;
  name: string;
  summary: string;
  cover: string;
  neighborhood: string;
  organizerId: string;
  joinNote: string;
  schedule: string;
}

export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  role: "organizer" | "member";
  joinedAt: string;
}

export interface Conversation {
  id: string;
  kind: "activity" | "community" | "direct";
  activityId: string | null;
  communityId: string | null;
  memberIds: string[];
  title: string;
}

export interface ReadMark {
  conversationId: string;
  userId: string;
  lastReadAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: "text" | "system" | "announcement" | "enroute";
  body: string;
  createdAt: string;
  parentId: string | null;
  reactions: { userId: string; emoji: string }[];
}

export interface Poll {
  id: string;
  activityId: string;
  authorId: string;
  question: string;
  createdAt: string;
  live: boolean;
}

export interface PollOption {
  id: string;
  pollId: string;
  label: string;
}

export interface PollVote {
  id: string;
  pollId: string;
  optionId: string;
  userId: string;
  createdAt: string;
}

export interface CheckIn {
  id: string;
  activityId: string;
  userId: string;
  method: "self" | "code" | "host";
  createdAt: string;
}

export interface PromptCard {
  id: string;
  activityId: string;
  prompt: string;
}

export interface PromptAnswer {
  id: string;
  promptId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export interface Suggestion {
  id: string;
  activityId: string;
  userId: string;
  title: string;
  createdAt: string;
}

export interface Checklist {
  id: string;
  activityId: string;
  userId: string;
  items: { id: string; label: string; done: boolean }[];
}

export interface ConnectionRequest {
  id: string;
  activityId: string;
  fromUserId: string;
  toUserId: string;
  createdAt: string;
}

export interface MutualConnection {
  id: string;
  userAId: string;
  userBId: string;
  activityId: string;
  createdAt: string;
}

export interface EventMedia {
  id: string;
  activityId: string;
  authorId: string;
  src: string;
  caption: string;
  createdAt: string;
}

export interface Review {
  id: string;
  activityId: string;
  authorId: string;
  hostId: string;
  hostRating: number;
  eventRating: number;
  belonging: number;
  note: string;
  safetyConcern: boolean;
  createdAt: string;
}

export interface SafetyReport {
  id: string;
  reporterId: string;
  targetUserId: string | null;
  activityId: string | null;
  reason: string;
  details: string;
  status: "open" | "reviewing" | "closed";
  createdAt: string;
}

export interface Block {
  id: string;
  userId: string;
  blockedUserId: string;
  createdAt: string;
}

export interface Notice {
  id: string;
  userId: string;
  title: string;
  body: string;
  href: string;
  kind: "reminder" | "waitlist" | "rsvp" | "connection" | "safety" | "host" | "chat";
  createdAt: string;
  read: boolean;
}

export interface LocationShare {
  activityId: string;
  userId: string;
  active: boolean;
  updatedAt: string;
}

export interface GameMark {
  activityId: string;
  userId: string;
  kind: "bingo" | "mission";
  itemId: string;
}

export interface PulseVote {
  activityId: string;
  userId: string;
  value: "great" | "okay" | "help";
  updatedAt: string;
}

export interface SavedActivity {
  userId: string;
  activityId: string;
}

export interface Filters {
  query: string;
  when: "any" | "today" | "tomorrow" | "weekend";
  distanceKm: number | null;
  type: string | null;
  group: "any" | "intimate" | "small";
  price: "any" | "free" | "under80";
  language: string | null;
  stepFree: boolean;
  energy: Energy | null;
  womenOnly: "include" | "only" | "hide";
}

export interface Toast {
  tone: "good" | "error" | "info";
  message: string;
}

export interface AppState {
  schemaVersion: number;
  sessionUserId: string | null;
  users: User[];
  preferences: UserPreference[];
  verifications: Verification[];
  venues: Venue[];
  activities: Activity[];
  rsvps: RSVP[];
  waitlist: WaitlistEntry[];
  communities: Community[];
  communityMembers: CommunityMember[];
  conversations: Conversation[];
  reads: ReadMark[];
  messages: Message[];
  polls: Poll[];
  pollOptions: PollOption[];
  pollVotes: PollVote[];
  checkIns: CheckIn[];
  prompts: PromptCard[];
  promptAnswers: PromptAnswer[];
  suggestions: Suggestion[];
  checklists: Checklist[];
  connectionRequests: ConnectionRequest[];
  connections: MutualConnection[];
  media: EventMedia[];
  reviews: Review[];
  reports: SafetyReport[];
  blocks: Block[];
  notices: Notice[];
  locationShares: LocationShare[];
  gameMarks: GameMark[];
  pulses: PulseVote[];
  saved: SavedActivity[];
  filters: Filters;
  toast: Toast | null;
}

export const EMPTY_FILTERS: Filters = {
  query: "",
  when: "any",
  distanceKm: null,
  type: null,
  group: "any",
  price: "any",
  language: null,
  stepFree: false,
  energy: null,
  womenOnly: "include",
};

export interface ActivityDraft {
  communityId: string | null;
  title: string;
  description: string;
  type: string;
  cover: string;
  neighborhood: string;
  placeName: string;
  exactAddress: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  price: number;
  energy: Energy;
  languages: string[];
  accessibility: string[];
  experience: Experience;
  audience: Audience;
  tags: string[];
  modules: ActivityModules;
}
