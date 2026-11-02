import { ui, type Copy } from "./copy";
import { Icon, Logo } from "./icons";
import { journey, useApp } from "./state";
import type { Scenario, Screen } from "./types";

const groups: { label: Copy; screens: { id: Screen; label: Copy }[] }[] = [
  {
    label: { en: "Arrive", ar: "الوصول", hi: "शुरुआत" },
    screens: [
      { id: "landing", label: { en: "Landing", ar: "الصفحة التعريفية", hi: "लैंडिंग" } },
      { id: "auth", label: { en: "Sign up / in", ar: "حساب", hi: "साइन अप / इन" } },
      { id: "country", label: { en: "Country", ar: "البلد", hi: "देश" } },
      { id: "onboarding", label: { en: "Onboarding", ar: "التهيئة", hi: "ऑनबोर्डिंग" } },
      { id: "verify", label: { en: "Verification", ar: "التوثيق", hi: "सत्यापन" } },
      { id: "identity", label: { en: "Identity", ar: "الهوية", hi: "पहचान" } },
    ],
  },
  {
    label: { en: "Discover", ar: "الاستكشاف", hi: "खोज" },
    screens: [
      { id: "home", label: ui.home },
      { id: "search", label: { en: "Search", ar: "البحث", hi: "खोज परिणाम" } },
      { id: "map", label: ui.map },
      { id: "category", label: { en: "Category", ar: "الفئة", hi: "श्रेणी" } },
      { id: "listing", label: { en: "Listing", ar: "الإعلان", hi: "लिस्टिंग" } },
      { id: "matches", label: ui.matches },
      { id: "favorites", label: ui.favorites },
      { id: "saved", label: { en: "Saved searches", ar: "عمليات البحث المحفوظة", hi: "सहेजी खोजें" } },
    ],
  },
  {
    label: { en: "Trade", ar: "الصفقة", hi: "सौदा" },
    screens: [
      { id: "create", label: { en: "Create listing", ar: "إنشاء إعلان", hi: "लिस्टिंग बनाएँ" } },
      { id: "manage", label: { en: "Manage listing", ar: "إدارة الإعلان", hi: "लिस्टिंग संभालें" } },
      { id: "proposal", label: { en: "Proposal builder", ar: "بناء الاقتراح", hi: "प्रस्ताव निर्माता" } },
      { id: "offer", label: { en: "Offer review", ar: "مراجعة العرض", hi: "ऑफ़र समीक्षा" } },
      { id: "compare", label: { en: "Compare versions", ar: "مقارنة النسخ", hi: "संस्करण तुलना" } },
      { id: "messages", label: ui.messages },
      { id: "thread", label: { en: "Conversation", ar: "المحادثة", hi: "बातचीत" } },
      { id: "trades", label: ui.trades },
      { id: "workspace", label: { en: "Trade workspace", ar: "مساحة الصفقة", hi: "सौदा कार्यक्षेत्र" } },
      { id: "schedule", label: { en: "Scheduler", ar: "الموعد", hi: "समय" } },
      { id: "checkin", label: { en: "Safety check-in", ar: "تسجيل السلامة", hi: "सुरक्षा चेक-इन" } },
      { id: "complete", label: { en: "Completion", ar: "الإتمام", hi: "पूरा करना" } },
      { id: "review", label: ui.review },
    ],
  },
  {
    label: { en: "Trust", ar: "الثقة", hi: "भरोसा" },
    screens: [
      { id: "profile", label: ui.profile },
      { id: "notifications", label: ui.notifications },
      { id: "settings", label: ui.settings },
      { id: "safety", label: ui.safety },
      { id: "policy", label: ui.policy },
      { id: "report", label: ui.report },
      { id: "dispute", label: { en: "Dispute", ar: "نزاع", hi: "विवाद" } },
      { id: "admin", label: { en: "Moderation", ar: "الإشراف", hi: "मॉडरेशन" } },
      { id: "design", label: { en: "Design spec", ar: "مواصفات التصميم", hi: "डिज़ाइन विवरण" } },
      { id: "states", label: { en: "States", ar: "الحالات", hi: "अवस्थाएँ" } },
    ],
  },
];

const exceptions: { id: Scenario; label: Copy }[] = [
  { id: "prohibited-listing", label: { en: "Prohibited listing", ar: "إعلان ممنوع", hi: "प्रतिबंधित लिस्टिंग" } },
  { id: "prohibited-counter", label: { en: "Prohibited counteroffer", ar: "عرض مقابل ممنوع", hi: "प्रतिबंधित प्रतिप्रस्ताव" } },
  { id: "unavailable", label: { en: "Item unavailable", ar: "الغرض غير متاح", hi: "वस्तु उपलब्ध नहीं" } },
  { id: "significant-diff", label: { en: "Significant difference", ar: "فرق كبير", hi: "बड़ा अंतर" } },
  { id: "report-counterfeit", label: { en: "Report counterfeit", ar: "بلاغ تقليد", hi: "नकली की रिपोर्ट" } },
  { id: "meetup-cancelled", label: { en: "Meetup cancelled", ar: "أُلغي اللقاء", hi: "मुलाकात रद्द" } },
  { id: "disputed", label: { en: "Dispute", ar: "نزاع", hi: "विवाद" } },
  { id: "under-review", label: { en: "Listing under review", ar: "إعلان قيد المراجعة", hi: "लिस्टिंग समीक्षा में" } },
  { id: "rejected", label: { en: "Listing rejected", ar: "إعلان مرفوض", hi: "लिस्टिंग अस्वीकृत" } },
  { id: "restricted", label: { en: "Account restricted", ar: "حساب مقيّد", hi: "खाता प्रतिबंधित" } },
  { id: "location-denied", label: { en: "Location denied", ar: "رُفض الموقع", hi: "स्थान अस्वीकृत" } },
  { id: "network", label: { en: "Network failure", ar: "انقطع الاتصال", hi: "नेटवर्क विफल" } },
  { id: "upload-failed", label: { en: "Upload failed", ar: "فشل الرفع", hi: "अपलोड विफल" } },
];

function PrototypeBar() {
  const app = useApp();
  const step = journey[app.journeyAt];
  return (
    <div className="proto">
      <strong>SwapFair prototype</strong>
      <span className="num">{app.journeyAt + 1}/{journey.length}</span>
      <button type="button" onClick={() => app.jumpJourney(Math.min(journey.length - 1, app.journeyAt + 1))}>
        {app.locale === "ar" ? "التالي في القصة" : app.locale === "hi" ? "कहानी में आगे" : "Next in story"}
      </button>
      <details className="menu">
        <summary>{step ? (app.locale === "ar" ? step.ar : app.locale === "hi" ? step.hi : step.en) : "Story"}</summary>
        <div>
          {journey.map((item, index) => (
            <button type="button" key={item.id} aria-current={index === app.journeyAt} onClick={() => app.jumpJourney(index)}>
              {index + 1}. {app.locale === "ar" ? item.ar : app.locale === "hi" ? item.hi : item.en}
            </button>
          ))}
        </div>
      </details>
      <details className="menu">
        <summary>{app.locale === "ar" ? "الشاشات" : app.locale === "hi" ? "स्क्रीन" : "Screens"}</summary>
        <div>
          {groups.map((group) => (
            <div key={group.label.en}>
              <p>{app.t(group.label)}</p>
              {group.screens.map((item) => (
                <button type="button" key={item.id} onClick={() => app.go(item.id)}>{app.t(item.label)}</button>
              ))}
            </div>
          ))}
        </div>
      </details>
      <details className="menu">
        <summary>{app.locale === "ar" ? "الاستثناءات" : app.locale === "hi" ? "अपवाद" : "Exceptions"}</summary>
        <div>
          {exceptions.map((item) => (
            <button type="button" key={item.id} onClick={() => item.id && app.runException(item.id)}>{app.t(item.label)}</button>
          ))}
        </div>
      </details>
      <select aria-label={app.t(ui.language)} value={app.locale} onChange={(event) => app.setLocale(event.target.value as "en" | "ar" | "hi")}>
        <option value="en">English</option>
        <option value="ar">العربية</option>
        <option value="hi">हिन्दी</option>
      </select>
      <button type="button" onClick={() => app.setCountry(app.country === "AE" ? "IN" : "AE")}>
        {app.country === "AE" ? "UAE · AED" : "India · INR"}
      </button>
      <button type="button" onClick={() => app.setTheme(app.theme === "light" ? "dark" : "light")}>
        {app.theme === "light" ? "Dark" : "Light"}
      </button>
      <button type="button" onClick={() => app.setLoading(!app.loading)}>{app.loading ? "Hide skeletons" : "Skeletons"}</button>
      <span className="spacer" />
      <button type="button" onClick={() => app.setChrome(false)}>Hide chrome</button>
      <button type="button" onClick={app.reset}>Reset</button>
    </div>
  );
}

const bare: Screen[] = ["landing", "auth", "country", "onboarding", "verify", "identity", "admin", "design"];

export function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const showNav = !bare.includes(app.screen);
  const current = app.screen;
  return (
    <>
      {app.chrome ? <PrototypeBar /> : <button className="btn btn-primary show-proto" onClick={() => app.setChrome(true)}>Prototype</button>}
      <div className={app.chrome ? "product" : "product chrome-off"}>
        <a className="skip" href="#main">Skip to content</a>
        {showNav ? <TopNav /> : null}
        <main id="main">{children}</main>
        {showNav ? (
          <nav className="bottomnav" aria-label="Primary">
            <NavButton id="home" icon="home" label={ui.home} current={current} />
            <NavButton id="search" icon="compass" label={ui.discover} current={current} />
            <button type="button" onClick={() => app.go("create")} aria-current={current === "create" ? "page" : undefined}>
              <span className="create-tab"><Icon name="plus" /></span>
              {app.t(ui.create)}
            </button>
            <NavButton id="trades" icon="trades" label={ui.trades} current={current} />
            <button type="button" aria-current={current === "profile" ? "page" : undefined} onClick={() => { app.patch({ profileId: app.meId }); app.go("profile"); }}>
              <Icon name="user" />
              {app.t(ui.profile)}
            </button>
          </nav>
        ) : null}
        {app.toast ? <div className="toast" role="status">{app.toast}</div> : null}
      </div>
    </>
  );
}

function NavButton({ id, icon, label, current }: { id: Screen; icon: string; label: Copy; current: Screen }) {
  const app = useApp();
  const on = current === id || (id === "search" && ["map", "category", "matches"].includes(current)) || (id === "trades" && ["workspace", "offer", "proposal"].includes(current));
  return (
    <button type="button" aria-current={on ? "page" : undefined} onClick={() => app.go(id)}>
      <Icon name={icon} />
      {app.t(label)}
    </button>
  );
}

function TopNav() {
  const app = useApp();
  const item = (id: Screen, label: Copy) => (
    <button type="button" aria-current={app.screen === id ? "page" : undefined} onClick={() => app.go(id)}>{app.t(label)}</button>
  );
  return (
    <header className="topnav">
      <button className="brand" onClick={() => app.go("home")}><Logo /> SwapFair</button>
      <label className="searchpill">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder={app.t(ui.search)}
          value={app.story.search.text}
          onChange={(event) => app.patch({ search: { ...app.story.search, text: event.target.value } })}
          onFocus={() => app.screen !== "search" && app.go("search")}
        />
      </label>
      <nav className="navlinks" aria-label="Primary">
        {item("search", ui.discover)}
        {item("matches", ui.matches)}
        {item("trades", ui.trades)}
        {item("messages", ui.messages)}
        {item("favorites", ui.favorites)}
      </nav>
      <div className="top-actions">
        <button className="btn btn-primary btn-small" onClick={() => app.go("create")}>{app.t({ en: "Create listing", ar: "إعلان جديد", hi: "नई लिस्टिंग" })}</button>
        <button className="icon-btn" aria-label={app.t(ui.notifications)} onClick={() => app.go("notifications")}><Icon name="bell" size={18} /></button>
        <button className="icon-btn" aria-label={app.t(ui.profile)} onClick={() => { app.patch({ profileId: app.meId }); app.go("profile"); }}><Icon name="user" size={18} /></button>
      </div>
    </header>
  );
}
