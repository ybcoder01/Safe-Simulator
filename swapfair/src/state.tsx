import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { say, type Copy, type Locale } from "./copy";
import { initialStories, listingById, people } from "./data";
import { emptyDraft } from "./logic";
import type {
  CategoryId,
  Country,
  CreateDraft,
  Draft,
  Handoff,
  LineItem,
  MeetupPlan,
  Phase,
  Scenario,
  Screen,
  Story,
  Version,
} from "./types";

type Theme = "light" | "dark";

export const journey = [
  { id: "register", screen: "auth" as Screen, en: "Register", ar: "التسجيل", hi: "रजिस्टर" },
  { id: "country", screen: "country" as Screen, en: "Country", ar: "البلد", hi: "देश" },
  { id: "onboarding", screen: "onboarding" as Screen, en: "Onboarding", ar: "التهيئة", hi: "शुरुआत" },
  { id: "verify", screen: "verify" as Screen, en: "Verify", ar: "التوثيق", hi: "सत्यापन" },
  { id: "create", screen: "create" as Screen, en: "Create listing", ar: "إنشاء إعلان", hi: "लिस्टिंग बनाएँ" },
  { id: "wants", screen: "create" as Screen, en: "What you want", ar: "ما تريده", hi: "आप क्या चाहते हैं" },
  { id: "match", screen: "home" as Screen, en: "Match", ar: "مطابقة", hi: "मेल" },
  { id: "listing", screen: "listing" as Screen, en: "Open listing", ar: "فتح الإعلان", hi: "लिस्टिंग खोलें" },
  { id: "build", screen: "proposal" as Screen, en: "Build proposal", ar: "بناء الاقتراح", hi: "प्रस्ताव बनाएँ" },
  { id: "cash", screen: "proposal" as Screen, en: "Cash adjustment", ar: "تعديل نقدي", hi: "नकद समायोजन" },
  { id: "send", screen: "offer" as Screen, en: "Send", ar: "إرسال", hi: "भेजें" },
  { id: "counter", screen: "offer" as Screen, en: "Counteroffer", ar: "عرض مقابل", hi: "प्रतिप्रस्ताव" },
  { id: "compare", screen: "compare" as Screen, en: "Compare", ar: "مقارنة", hi: "तुलना" },
  { id: "accept", screen: "workspace" as Screen, en: "Accept", ar: "قبول", hi: "स्वीकार" },
  { id: "schedule", screen: "schedule" as Screen, en: "Schedule", ar: "الموعد", hi: "समय" },
  { id: "checkin", screen: "checkin" as Screen, en: "Check-in", ar: "تسجيل الوصول", hi: "चेक-इन" },
  { id: "confirm", screen: "complete" as Screen, en: "Confirm", ar: "تأكيد", hi: "पुष्टि" },
  { id: "review", screen: "review" as Screen, en: "Review", ar: "التقييم", hi: "समीक्षा" },
];

const line = (id: string, value: number): LineItem => ({
  id,
  title: listingById(id)?.title ?? { en: id, ar: id, hi: id },
  value,
});

function v1(): Version {
  return {
    n: 1,
    sender: "me",
    at: "28 Oct, 2:15 pm",
    your: [line("ipad", 1800), line("kindle", 280)],
    their: [line("camera", 2100)],
    yourCash: 20,
    theirCash: 0,
    place: "Marina Walk, in front of Spinneys",
    method: "meetup",
    date: "Sat 1 Nov, 4:30 pm",
    note: "Happy to meet in public and look at the sensor together.",
  };
}

function v2(): Version {
  return {
    n: 2,
    sender: "them",
    at: "28 Oct, 4:02 pm",
    your: [line("ipad", 1800)],
    their: [line("camera", 2000), line("strap", 180)],
    yourCash: 380,
    theirCash: 0,
    place: "Dubai Mall, near the waterfall",
    method: "meetup",
    date: "Sat 1 Nov, 5:00 pm",
    note: "I would rather not take the Kindle. I can add the strap, meet at Dubai Mall, and adjust the camera estimate to AED 2,000.",
  };
}

const meetupPlan: MeetupPlan = {
  place: "Dubai Mall, near the waterfall, ground floor",
  date: "Sat 1 Nov, 5:00 pm",
  method: "meetup",
  whoPays: "No shipping. Cash adjustment is handed over in person.",
  trustedName: "Hessa",
  trustedPhone: "+971 50 000 0000",
};

function listedCreate(create: CreateDraft): CreateDraft {
  return { ...create, step: 8, owned: true, ackValue: true, photos: 3, outcome: "allowed" };
}

export function journeyStory(index: number): Story {
  const story = initialStories().AE;
  const step = journey[index]?.id ?? "register";
  const ready = () => {
    story.phase = "listed";
    story.create = listedCreate(story.create);
    story.have = ["electronics"];
    story.want = ["cameras"];
  };
  if (step === "register") {
    story.phase = "guest";
    story.authMode = "signup";
  } else if (step === "country") {
    story.phase = "onboarding";
  } else if (step === "onboarding") {
    story.phase = "onboarding";
    story.onboardStep = 0;
  } else if (step === "verify") {
    story.phase = "onboarding";
    story.onboardStep = 2;
  } else if (step === "create") {
    story.phase = "verified";
    story.create = { ...story.create, step: 1 };
  } else if (step === "wants") {
    story.phase = "verified";
    story.create = { ...story.create, step: 5, owned: true, ackValue: true, photos: 3 };
  } else if (step === "match") {
    ready();
  } else if (step === "listing") {
    ready();
    story.listingId = "camera";
    story.recent = ["camera"];
  } else if (step === "build") {
    ready();
    story.listingId = "camera";
    story.draft = {
      ...emptyDraft(),
      yourIds: ["ipad", "kindle"],
      theirIds: ["camera"],
      yourCash: 0,
      place: "Marina Walk, in front of Spinneys",
      date: "Sat 1 Nov, 4:30 pm",
      message: "The iPad and Kindle together are close to your camera. I can add a small cash adjustment.",
    };
  } else if (step === "cash") {
    ready();
    story.draft = {
      ...emptyDraft(),
      yourIds: ["ipad", "kindle"],
      theirIds: ["camera"],
      yourCash: 20,
      place: "Marina Walk, in front of Spinneys",
      date: "Sat 1 Nov, 4:30 pm",
      message: "Added AED 20 so the two sides meet.",
    };
  } else if (step === "send") {
    ready();
    story.phase = "sent";
    story.versions = [v1()];
    story.draft = { ...emptyDraft(), yourIds: ["ipad", "kindle"], theirIds: ["camera"], yourCash: 20 };
  } else if (step === "counter" || step === "compare") {
    ready();
    story.phase = "countered";
    story.versions = [v1(), v2()];
  } else if (step === "accept") {
    ready();
    story.phase = "accepted";
    story.versions = [v1(), v2()];
    story.locked = 2;
  } else if (step === "schedule") {
    ready();
    story.phase = "scheduled";
    story.versions = [v1(), v2()];
    story.locked = 2;
    story.meetup = meetupPlan;
  } else if (step === "checkin") {
    ready();
    story.phase = "checkedin";
    story.versions = [v1(), v2()];
    story.locked = 2;
    story.meetup = meetupPlan;
    story.checkedIn = true;
    story.checkinEnds = Date.now() + 45 * 60 * 1000;
  } else if (step === "confirm") {
    ready();
    story.phase = "completed";
    story.versions = [v1(), v2()];
    story.locked = 2;
    story.meetup = meetupPlan;
    story.checkedIn = true;
    story.meConfirmed = true;
    story.themConfirmed = true;
  } else if (step === "review") {
    ready();
    story.phase = "completed";
    story.versions = [v1(), v2()];
    story.locked = 2;
    story.meetup = meetupPlan;
    story.meConfirmed = true;
    story.themConfirmed = true;
  }
  return story;
}

type Ctx = {
  locale: Locale;
  theme: Theme;
  country: Country;
  screen: Screen;
  chrome: boolean;
  sheet: string | null;
  toast: string | null;
  loading: boolean;
  journeyAt: number;
  story: Story;
  meId: string;
  t: (copy: Copy, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setChrome: (on: boolean) => void;
  setSheet: (sheet: string | null) => void;
  setLoading: (on: boolean) => void;
  notify: (message: string) => void;
  go: (screen: Screen) => void;
  back: () => void;
  reset: () => void;
  patch: (partial: Partial<Story>) => void;
  updateCreate: (partial: Partial<CreateDraft>) => void;
  updateDraft: (partial: Partial<Draft>) => void;
  setCountry: (country: Country) => void;
  chooseMarket: (country: Country, partial: Partial<Story>, screen: Screen) => void;
  openListing: (id: string) => void;
  openProfile: (id: string) => void;
  toggleFavorite: (id: string) => void;
  jumpJourney: (index: number) => void;
  runException: (id: Scenario) => void;
  publishListing: () => void;
  sendProposal: () => void;
  simulateCounter: () => void;
  acceptLocked: (n: number) => void;
  declineTrade: () => void;
  withdrawTrade: () => void;
  confirmMine: () => void;
  confirmTheirs: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}

function snapshot(story: Story, sender: "me" | "them"): Version {
  const item = (id: string): LineItem => {
    const listing = listingById(id);
    const value = story.draft.values[id] ?? listing?.value ?? 0;
    return { id, title: listing?.title ?? { en: id, ar: id, hi: id }, value };
  };
  return {
    n: story.versions.length + 1,
    sender,
    at: "Just now",
    your: story.draft.yourIds.map(item),
    their: story.draft.theirIds.map(item),
    yourCash: story.draft.yourCash,
    theirCash: story.draft.theirCash,
    place: story.draft.place,
    method: story.draft.method,
    date: story.draft.date,
    note: story.draft.message,
  };
}

export function Provider({ children, onReset }: { children: ReactNode; onReset: () => void }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const [country, setCountryState] = useState<Country>("AE");
  const [stories, setStories] = useState(initialStories);
  const [screen, setScreen] = useState<Screen>("landing");
  const [, setHistory] = useState<Screen[]>([]);
  const [chrome, setChrome] = useState(true);
  const [sheet, setSheet] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [journeyAt, setJourneyAt] = useState(0);

  const story = stories[country];
  const meId = country === "AE" ? "layla" : "arjun";

  useEffect(() => {
    document.documentElement.lang = locale === "ar" ? "ar" : locale === "hi" ? "hi" : "en";
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.dataset.theme = theme;
    document.title = "SwapFair";
  }, [locale, theme]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const journeyIndex = params.get("journey");
    const requested = params.get("screen") as Screen | null;
    const requestedLocale = params.get("lang");
    if (requestedLocale === "ar" || requestedLocale === "hi" || requestedLocale === "en") setLocale(requestedLocale);
    if (params.get("theme") === "dark") setTheme("dark");
    if (params.get("chrome") === "0") setChrome(false);
    if (journeyIndex) {
      const index = Number(journeyIndex);
      if (Number.isFinite(index) && journey[index]) {
        setCountryState("AE");
        setStories((prev) => ({ ...prev, AE: journeyStory(index) }));
        setScreen(journey[index].screen);
        setJourneyAt(index);
      }
    } else if (requested) {
      setScreen(requested);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const patch = (partial: Partial<Story>) => {
    setStories((prev) => ({ ...prev, [country]: { ...prev[country], ...partial } }));
  };

  const go = (next: Screen) => {
    setHistory((prev) => [...prev, screen]);
    setScreen(next);
    setSheet(null);
  };

  const value = useMemo<Ctx>(() => {
    const t = (copy: Copy, vars?: Record<string, string | number>) => say(locale, copy, vars);
    return {
      locale,
      theme,
      country,
      screen,
      chrome,
      sheet,
      toast,
      loading,
      journeyAt,
      story,
      meId,
      t,
      setLocale,
      setTheme,
      setChrome,
      setSheet,
      setLoading,
      notify: setToast,
      go,
      back: () => {
        setHistory((prev) => {
          const copy = [...prev];
          const last = copy.pop();
          if (last) setScreen(last);
          return copy;
        });
      },
      reset: onReset,
      patch,
      updateCreate: (partial) => patch({ create: { ...story.create, ...partial } }),
      updateDraft: (partial) => patch({ draft: { ...story.draft, ...partial, ack: partial.ack ?? false } }),
      setCountry: (next) => {
        setCountryState(next);
        setScreen("home");
        setSheet(null);
      },
      chooseMarket: (next, partial, nextScreen) => {
        setCountryState(next);
        setStories((prev) => ({ ...prev, [next]: { ...prev[next], ...partial } }));
        setScreen(nextScreen);
        setSheet(null);
      },
      openListing: (id) => {
        patch({
          listingId: id,
          recent: [id, ...story.recent.filter((item) => item !== id)].slice(0, 6),
        });
        go("listing");
      },
      openProfile: (id) => {
        patch({ profileId: id });
        go("profile");
      },
      toggleFavorite: (id) => {
        const has = story.favorites.includes(id);
        patch({ favorites: has ? story.favorites.filter((item) => item !== id) : [...story.favorites, id] });
      },
      jumpJourney: (index) => {
        const next = journeyStory(index);
        setCountryState("AE");
        setStories((prev) => ({ ...prev, AE: next }));
        setScreen(journey[index]?.screen ?? "landing");
        setJourneyAt(index);
        setSheet(null);
      },
      runException: (id) => {
        const base = initialStories().AE;
        base.phase = "listed";
        base.create = listedCreate(base.create);
        if (id === "prohibited-listing") {
          base.phase = "verified";
          base.create = {
            ...base.create,
            step: 7,
            title: "Augmentin 625 antibiotic strips",
            description: "Unopened prescription antibiotic bought last month.",
            category: "home",
            outcome: "prohibited",
            photos: 1,
            owned: true,
            ackValue: true,
          };
          setScreen("create");
        } else if (id === "prohibited-counter") {
          base.draft = {
            ...emptyDraft(),
            yourIds: ["ipad"],
            theirIds: ["camera"],
            request: "Bottle of Johnnie Walker Black Label",
            mode: "counter",
          };
          base.versions = [v1()];
          base.phase = "sent";
          setScreen("proposal");
        } else if (id === "unavailable") {
          base.listingId = "ps5";
          setScreen("listing");
        } else if (id === "significant-diff") {
          base.draft = {
            ...emptyDraft(),
            yourIds: ["ipad"],
            theirIds: ["camera", "strap"],
            yourCash: 0,
            place: "Dubai Mall, near the waterfall",
          };
          setScreen("proposal");
        } else if (id === "report-counterfeit") {
          base.listingId = "watch";
          setScreen("report");
        } else if (id === "meetup-cancelled") {
          base.phase = "scheduled";
          base.versions = [v1(), v2()];
          base.locked = 2;
          base.meetup = meetupPlan;
          base.scenario = "meetup-cancelled";
          setScreen("workspace");
        } else if (id === "disputed") {
          base.phase = "checkedin";
          base.versions = [v1(), v2()];
          base.locked = 2;
          base.meetup = meetupPlan;
          base.checkedIn = true;
          base.scenario = "disputed";
          setScreen("dispute");
        } else if (id === "restricted") {
          base.scenario = "restricted";
          setScreen("home");
        } else if (id === "under-review") {
          base.scenario = "under-review";
          base.create = { ...base.create, outcome: "review", title: "Omron blood pressure monitor" };
          setScreen("manage");
        } else if (id === "rejected") {
          base.scenario = "rejected";
          setScreen("manage");
        } else if (id === "location-denied" || id === "network") {
          base.scenario = id;
          setScreen("home");
        } else if (id === "upload-failed") {
          base.phase = "verified";
          base.create = { ...base.create, step: 2 };
          base.scenario = "upload-failed";
          setScreen("create");
        }
        if (id) base.scenario = base.scenario ?? id;
        setCountryState("AE");
        setStories((prev) => ({ ...prev, AE: { ...base } }));
        setSheet(null);
      },
      publishListing: () => {
        if (story.create.outcome === "prohibited") return;
        if (story.create.outcome === "review") {
          patch({ scenario: "under-review", phase: "listed" });
          setScreen("manage");
          setToast(t({ en: "Saved for review", ar: "حُفظ للمراجعة", hi: "समीक्षा के लिए सहेजा गया" }));
          return;
        }
        patch({ phase: "listed", scenario: null, paused: false, create: { ...story.create, outcome: "allowed" } });
        setScreen("home");
        setToast(t({ en: "Your listing is live", ar: "إعلانك منشور", hi: "आपकी लिस्टिंग लाइव है" }));
      },
      sendProposal: () => {
        const snap = snapshot(story, "me");
        const phase: Phase = story.draft.mode === "counter" || story.versions.length > 0 ? "countered" : "sent";
        patch({
          versions: [...story.versions, snap],
          phase,
          outcome: "open",
          locked: null,
          scenario: null,
        });
        setScreen("offer");
        setSheet(null);
        setToast(t({ en: "Proposal sent as a new version", ar: "أُرسل الاقتراح كنسخة جديدة", hi: "प्रस्ताव नए संस्करण के रूप में भेजा गया" }));
      },
      simulateCounter: () => {
        const versions = story.versions.length ? story.versions : [v1()];
        patch({ versions: versions.length > 1 ? versions : [...versions, v2()], phase: "countered", outcome: "open" });
        setScreen("offer");
        setToast(t({ en: "Rohan sent version 2", ar: "أرسل روهان النسخة 2", hi: "रोहन ने संस्करण 2 भेजा" }));
      },
      acceptLocked: (n) => {
        patch({ locked: n, phase: "accepted", outcome: "open" });
        setScreen("workspace");
        setToast(t({ en: "Terms locked", ar: "ثُبّتت الشروط", hi: "शर्तें लॉक हो गईं" }));
      },
      declineTrade: () => {
        patch({ outcome: "declined", phase: "listed", locked: null });
        setScreen("offer");
        setToast(t({ en: "Proposal declined", ar: "رُفض الاقتراح", hi: "प्रस्ताव अस्वीकृत" }));
      },
      withdrawTrade: () => {
        patch({ outcome: "withdrawn", phase: "listed", locked: null });
        setScreen("offer");
        setToast(t({ en: "Proposal withdrawn", ar: "سُحب الاقتراح", hi: "प्रस्ताव वापस लिया गया" }));
      },
      confirmMine: () => {
        const both = story.themConfirmed;
        patch({ meConfirmed: true, phase: both ? "completed" : "awaiting" });
        setScreen(both ? "complete" : "complete");
      },
      confirmTheirs: () => {
        const both = story.meConfirmed;
        patch({ themConfirmed: true, phase: both ? "completed" : "awaiting" });
      },
    };
    // history is intentionally read through setState callbacks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, theme, country, screen, chrome, sheet, toast, loading, journeyAt, story, meId, onReset]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function mePerson(meId: string) {
  return people[meId];
}

export type { Handoff, CategoryId };
