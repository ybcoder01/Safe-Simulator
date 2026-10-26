import type { Energy, Experience } from "./types";

export const DUBAI = "Asia/Dubai";

export const INTERESTS = [
  "Coffee",
  "Walks",
  "Food",
  "Games",
  "Outdoors",
  "Language",
  "Design",
  "Coworking",
  "Art",
  "Movement",
  "Music",
  "Photography",
] as const;

export const CATEGORIES: { type: string; label: string; tint: string }[] = [
  { type: "Coffee", label: "Coffee", tint: "bg-[#f6d7b8]" },
  { type: "Outdoors", label: "Outdoors", tint: "bg-[#d7ead7]" },
  { type: "Food", label: "Food", tint: "bg-[#f8d0c2]" },
  { type: "Games", label: "Games", tint: "bg-[#f3e3a4]" },
  { type: "Coworking", label: "Coworking", tint: "bg-[#d5e4f5]" },
  { type: "Language", label: "Language", tint: "bg-[#e4d7f5]" },
  { type: "Art", label: "Art", tint: "bg-[#f6d4e4]" },
  { type: "Movement", label: "Movement", tint: "bg-[#d4f0ea]" },
];

export const NEIGHBORHOODS: { name: string; lat: number; lng: number }[] = [
  { name: "Dubai Marina", lat: 25.0805, lng: 55.1403 },
  { name: "JBR", lat: 25.078, lng: 55.133 },
  { name: "JLT", lat: 25.0695, lng: 55.1442 },
  { name: "Kite Beach", lat: 25.1635, lng: 55.2085 },
  { name: "Alserkal Avenue", lat: 25.1412, lng: 55.2264 },
  { name: "DIFC", lat: 25.2105, lng: 55.2795 },
  { name: "Downtown", lat: 25.1972, lng: 55.2744 },
  { name: "Business Bay", lat: 25.1865, lng: 55.2642 },
  { name: "Al Fahidi", lat: 25.2634, lng: 55.2972 },
  { name: "Al Seef", lat: 25.2608, lng: 55.3095 },
  { name: "Dubai Creek", lat: 25.242, lng: 55.334 },
  { name: "Hatta", lat: 24.795, lng: 56.118 },
];

export function neighborhood(name: string) {
  return NEIGHBORHOODS.find((item) => item.name === name) ?? NEIGHBORHOODS[0]!;
}

export const LANGUAGES = ["English", "Arabic", "Hindi", "French", "Spanish", "Mandarin", "Russian", "Japanese"];

export const ACCESS_OPTIONS = ["Step-free", "Seating", "Shade", "Quiet-friendly", "Lifts", "Mats provided"];

export interface Template {
  id: string;
  name: string;
  type: string;
  title: string;
  description: string;
  energy: Energy;
  capacity: number;
  durationMin: number;
  price: number;
  experience: Experience;
  tags: string[];
  cover: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "coffee",
    name: "Coffee chat",
    type: "Coffee",
    title: "Coffee with a few new people",
    description:
      "One table, one round of drinks, and no pitches. We introduce ourselves once and let the conversation wander.",
    energy: "Relaxed",
    capacity: 4,
    durationMin: 90,
    price: 0,
    experience: "Newcomer-friendly",
    tags: ["Coffee", "Food"],
    cover: "/images/coffee.jpg",
  },
  {
    id: "dinner",
    name: "Dinner",
    type: "Food",
    title: "Dinner with a small table",
    description:
      "A shared table and a few plates. Tell the host about dietary needs in the poll so nobody has to announce them out loud.",
    energy: "Relaxed",
    capacity: 6,
    durationMin: 120,
    price: 90,
    experience: "Newcomer-friendly",
    tags: ["Food"],
    cover: "/images/dinner.jpg",
  },
  {
    id: "walk",
    name: "Walk",
    type: "Outdoors",
    title: "A slow walk and a conversation",
    description: "Comfortable shoes, an easy pace, and a stop if anyone wants one. The point is the company, not the distance.",
    energy: "Relaxed",
    capacity: 8,
    durationMin: 75,
    price: 0,
    experience: "Newcomer-friendly",
    tags: ["Walks", "Outdoors"],
    cover: "/images/marina.jpg",
  },
  {
    id: "cowork",
    name: "Coworking",
    type: "Coworking",
    title: "Quiet coworking, then a walk",
    description: "Headphones on for a focused block, then ten minutes of names and what you're working on. No demo day.",
    energy: "Focused",
    capacity: 8,
    durationMin: 120,
    price: 0,
    experience: "Newcomer-friendly",
    tags: ["Coworking"],
    cover: "/images/cowork.jpg",
  },
  {
    id: "sports",
    name: "Sports",
    type: "Movement",
    title: "A friendly game, all levels",
    description: "Rotating teams and a rule that nobody is left standing out. Arrive even if you have never played.",
    energy: "Lively",
    capacity: 10,
    durationMin: 90,
    price: 0,
    experience: "Newcomer-friendly",
    tags: ["Movement", "Outdoors"],
    cover: "/images/volley.jpg",
  },
  {
    id: "creative",
    name: "Creative workshop",
    type: "Art",
    title: "Make something small together",
    description: "Materials are ready. We make one small piece and talk while it dries. Experience is optional.",
    energy: "Focused",
    capacity: 8,
    durationMin: 100,
    price: 55,
    experience: "Newcomer-friendly",
    tags: ["Art", "Design"],
    cover: "/images/paint.jpg",
  },
];

export const DEFAULT_PROMPTS = [
  "What made you join?",
  "What's something you could talk about for hours?",
  "What should we know so the plan works for you?",
];

export const CONVERSATION_CARDS: Record<"light" | "medium" | "deeper", string[]> = {
  light: [
    "What is a small ritual you kept this week?",
    "Which street in this city would you show a friend first?",
    "What food would you walk twenty minutes for?",
    "What did you almost not leave the house for, and then you did?",
    "Which song has been stuck in your head?",
  ],
  medium: [
    "What is a skill you are quietly learning?",
    "Where do you feel like a regular, even a little?",
    "What is a question you like being asked?",
    "What is something you changed your mind about this year?",
    "Who is a person in this city you are glad you met, and why?",
  ],
  deeper: [
    "What did you misunderstand about this city at first?",
    "What kind of friendship are you actually hoping for?",
    "When do you feel most like yourself with other people?",
    "What is a story you tell when you want someone to know you?",
    "What would make tonight feel like it was worth leaving home for?",
  ],
};

export const BINGO = [
  { id: "moved", label: "Find someone who moved here this year" },
  { id: "bakery", label: "Find someone who will share a bakery" },
  { id: "three", label: "Find someone who speaks three languages" },
  { id: "ritual", label: "Find someone with a weekend ritual" },
  { id: "alone", label: "Find someone who came alone on purpose" },
  { id: "shade", label: "Find someone who knows a shady park" },
];

export const MISSIONS = [
  { id: "blue", label: "Photograph something blue, then put the phone away" },
  { id: "names", label: "Learn two names and one story" },
  { id: "share", label: "Offer or order something to share" },
];

export const GUIDELINES = [
  "Show up, or cancel in the app so the next person can have your place.",
  "Introductions stay about interests and plans, not appearance or status.",
  "Photos of other people need a yes before they go in the shared album.",
  "Flirting is not the purpose of a gathering. If someone wants to leave, they can.",
  "Safety concerns go to the host and to Gatherly. They are not posted as public reviews.",
  "Exact meeting points for private or approval gatherings stay hidden until you are in.",
];

export const CANCELLATION_POLICY =
  "Cancel in the app any time before the start. Your place goes to the first person waiting. A no-show is recorded only if you neither arrive nor cancel. Leaving early is welcome and is not a penalty.";

export const COVER_PRESETS = [
  { src: "/images/coffee.jpg", label: "Coffee" },
  { src: "/images/marina.jpg", label: "Waterfront" },
  { src: "/images/games.jpg", label: "Games" },
  { src: "/images/museum.jpg", label: "Museum" },
  { src: "/images/cowork.jpg", label: "Coworking" },
  { src: "/images/language.jpg", label: "Conversation" },
  { src: "/images/hike.jpg", label: "Hills" },
  { src: "/images/dinner.jpg", label: "Dinner" },
  { src: "/images/skyline.jpg", label: "City" },
  { src: "/images/volley.jpg", label: "Play" },
  { src: "/images/paint.jpg", label: "Studio" },
  { src: "/images/kayak.jpg", label: "Water" },
  { src: "/images/picnic.jpg", label: "Picnic" },
  { src: "/images/yoga.jpg", label: "Stretch" },
  { src: "/images/table.jpg", label: "Table" },
  { src: "/images/cafe.jpg", label: "Cafe" },
];

export const CHECKLIST_LABELS = [
  "Read the meeting point and how to find the group",
  "Add any access, food, or timing note in the room",
  "Check the reminder is on",
  "Plan a route that gets you there a few minutes early",
];
