import { L, say, type Copy, type Locale } from "./copy";
import type {
  BalanceKind,
  CategoryId,
  Currency,
  Draft,
  Handoff,
  Listing,
  Person,
  Phase,
  PolicyHit,
  SearchQuery,
  Story,
  TradeStatus,
  Version,
} from "./types";

export function money(amount: number, currency: Currency, locale: Locale): string {
  const loc =
    locale === "ar"
      ? "ar-AE-u-nu-latn"
      : locale === "hi"
        ? "hi-IN"
        : currency === "INR"
          ? "en-IN"
          : "en-AE";
  return new Intl.NumberFormat(loc, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function sideTotal(values: number[], cash: number): number {
  return values.reduce((sum, value) => sum + value, 0) + cash;
}

export function balanceKind(
  yours: number,
  theirs: number,
  currency: Currency,
  accepted: boolean,
): BalanceKind {
  const diff = Math.abs(yours - theirs);
  if (diff === 0) return "balanced";
  if (accepted) return "accepted";
  const larger = Math.max(yours, theirs, 1);
  const cap = currency === "AED" ? 400 : 10000;
  if (diff / larger > 0.15 || diff > cap) return "significant";
  return "small";
}

export function balanceLabel(kind: BalanceKind): Copy {
  if (kind === "balanced") return L("Balanced", "متوازنة", "संतुलित");
  if (kind === "small") return L("Small difference", "فرق بسيط", "थोड़ा अंतर");
  if (kind === "accepted") return L("Accepted difference", "فرق مقبول", "स्वीकृत अंतर");
  return L("Significant difference", "فرق كبير", "बड़ा अंतर");
}

export function gapSentence(
  yours: number,
  theirs: number,
  currency: Currency,
  locale: Locale,
): string {
  const diff = yours - theirs;
  const amount = money(Math.abs(diff), currency, locale);
  if (diff === 0) {
    return say(locale, L("Difference {amount}", "الفرق {amount}", "अंतर {amount}"), {
      amount: money(0, currency, locale),
    });
  }
  if (diff > 0) {
    return say(
      locale,
      L("Your side is {amount} higher", "طرفك أعلى بمقدار {amount}", "आपका पक्ष {amount} अधिक है"),
      { amount },
    );
  }
  return say(
    locale,
    L("Their side is {amount} higher", "طرفهم أعلى بمقدار {amount}", "उनका पक्ष {amount} अधिक है"),
    { amount },
  );
}

const prohibited: { re: RegExp; category: Copy; message: Copy }[] = [
  {
    re: /medicine|prescription|antibiotic|xanax|augmentin|pharmacy|tramadol|insulin|\bdrug\b|دواء|دواء|दवा|नुस्ख/i,
    category: L(
      "Medicines and prescription products",
      "الأدوية والمنتجات التي تحتاج إلى وصفة",
      "दवाएँ और नुस्खे वाले उत्पाद",
    ),
    message: L(
      "This listing appears to include an item that is not permitted on SwapFair. Medicines and prescription products cannot be offered or requested through the platform. Remove the item to continue.",
      "يبدو أن هذا الإعلان يتضمن غرضًا غير مسموح به على SwapFair. لا يمكن عرض الأدوية والمنتجات التي تحتاج إلى وصفة، ولا طلبها، عبر المنصة. أزل الغرض للمتابعة.",
      "यह लिस्टिंग ऐसी वस्तु दिखाती है जो SwapFair पर अनुमति नहीं है। दवाएँ और नुस्खे वाले उत्पाद प्लेटफ़ॉर्म पर न दिए जा सकते हैं, न माँगे जा सकते हैं। जारी रखने के लिए वस्तु हटाएँ।",
    ),
  },
  {
    re: /whisky|whiskey|vodka|rum|gin|beer|wine|alcohol|tobacco|cigarette|vape|johnnie walker|सिगरेट|शराब|كحول|سجائر|ويسكي/i,
    category: L("Alcohol and tobacco", "الكحول والتبغ", "शराब और तंबाकू"),
    message: L(
      "This listing appears to include an item that is not permitted on SwapFair. Alcohol and tobacco cannot be offered or requested through the platform. Remove the item to continue.",
      "يبدو أن هذا الإعلان يتضمن غرضًا غير مسموح به على SwapFair. لا يمكن عرض الكحول أو التبغ، ولا طلبهما، عبر المنصة. أزل الغرض للمتابعة.",
      "यह लिस्टिंग ऐसी वस्तु दिखाती है जो SwapFair पर अनुमति नहीं है। शराब और तंबाकू प्लेटफ़ॉर्म पर न दिए जा सकते हैं, न माँगे जा सकते हैं। जारी रखने के लिए वस्तु हटाएँ।",
    ),
  },
  {
    re: /gun|pistol|rifle|ammunition|weapon|explosive|taser|سلاح|بندقية|हथियार/i,
    category: L("Weapons", "أسلحة", "हथियार"),
    message: L(
      "This listing appears to include an item that is not permitted on SwapFair. Weapons and ammunition cannot be offered or requested through the platform. Remove the item to continue.",
      "يبدو أن هذا الإعلان يتضمن غرضًا غير مسموح به على SwapFair. لا يمكن عرض الأسلحة أو الذخيرة، ولا طلبها، عبر المنصة. أزل الغرض للمتابعة.",
      "यह लिस्टिंग ऐसी वस्तु दिखाती है जो SwapFair पर अनुमति नहीं है। हथियार और गोला-बारूद प्लेटफ़ॉर्म पर न दिए जा सकते हैं, न माँगे जा सकते हैं। जारी रखने के लिए वस्तु हटाएँ।",
    ),
  },
  {
    re: /bitcoin|crypto|usdt|ethereum|nft|عملة رقمية|क्रिप्टो/i,
    category: L(
      "Cryptocurrency and financial instruments",
      "العملات المشفرة والأدوات المالية",
      "क्रिप्टोकरेंसी और वित्तीय साधन",
    ),
    message: L(
      "This listing appears to include an item that is not permitted on SwapFair. Cryptocurrency and financial instruments cannot be offered or requested through the platform. Remove the item to continue.",
      "يبدو أن هذا الإعلان يتضمن غرضًا غير مسموح به على SwapFair. لا يمكن عرض العملات المشفرة أو الأدوات المالية، ولا طلبها، عبر المنصة. أزل الغرض للمتابعة.",
      "यह लिस्टिंग ऐसी वस्तु दिखाती है जो SwapFair पर अनुमति नहीं है। क्रिप्टोकरेंसी और वित्तीय साधन प्लेटफ़ॉर्म पर न दिए जा सकते हैं, न माँगे जा सकते हैं। जारी रखने के लिए वस्तु हटाएँ।",
    ),
  },
];

const reviewRe = /blood pressure|medical device|supplement|drone|laser pointer|جهاز طبي|ब्लड प्रेशर|ड्रोन/i;

export function scanPolicy(text: string): PolicyHit {
  const hit = prohibited.find((rule) => rule.re.test(text));
  if (hit) return { outcome: "prohibited", category: hit.category, message: hit.message };
  if (reviewRe.test(text)) {
    return {
      outcome: "review",
      category: L(
        "Possibly regulated goods",
        "أغراض قد تكون خاضعة لتنظيم",
        "संभवतः विनियमित वस्तुएँ",
      ),
      message: L(
        "We will save this listing and ask a moderator to look at it before it goes live. That does not mean you did anything wrong. Most reviews finish within a day, and we will notify you either way.",
        "سنحفظ هذا الإعلان ونطلب من مراجع النظر فيه قبل نشره. هذا لا يعني أنك ارتكبت خطأ. تنتهي معظم المراجعات خلال يوم، وسنبلغك بالنتيجة.",
        "हम यह लिस्टिंग सहेजेंगे और प्रकाशित करने से पहले एक मॉडरेटर से देखवाएँगे। इसका मतलब यह नहीं कि आपने कुछ गलत किया। ज़्यादातर समीक्षाएँ एक दिन में पूरी होती हैं, और हम आपको बताएँगे।",
      ),
    };
  }
  return { outcome: "allowed", category: null, message: null };
}

export function scamWarning(text: string): Copy | null {
  if (/whatsapp|telegram|instagram|off.?platform|واتساب|व्हाट्सऐप/i.test(text)) {
    return L(
      "This message asks to continue outside SwapFair. Agreements made off the platform are easier to dispute and harder to reconstruct.",
      "تطلب هذه الرسالة المتابعة خارج SwapFair. الاتفاقات خارج المنصة أصعب في المراجعة وإثبات ما تم.",
      "यह संदेश SwapFair के बाहर बात जारी रखने को कहता है। प्लेटफ़ॉर्म के बाहर हुई सहमति को बाद में जाँचना कठिन होता है।",
    );
  }
  if (/pay first|advance|transfer now|gift card|western union|ادفع أول|पहले पैसे/i.test(text)) {
    return L(
      "This message asks for payment before the exchange. SwapFair cannot protect an advance payment.",
      "تطلب هذه الرسالة الدفع قبل إتمام التبادل. لا تستطيع SwapFair حماية دفعة مقدمة.",
      "यह संदेश अदला-बदली से पहले भुगतान माँगता है। SwapFair अग्रिम भुगतान की रक्षा नहीं कर सकता।",
    );
  }
  if (/passport|emirates id|aadhaar|otp|جواز|आधार|ओटीपी/i.test(text)) {
    return L(
      "This message asks for an identity document or a one-time code. SwapFair will never ask you to send those in a chat.",
      "تطلب هذه الرسالة وثيقة هوية أو رمزًا لمرة واحدة. لن تطلب SwapFair إرسال ذلك في الدردشة.",
      "यह संदेश पहचान दस्तावेज़ या वन-टाइम कोड माँगता है। SwapFair चैट में ये कभी नहीं माँगता।",
    );
  }
  if (/https?:\/\/|bit\.ly|tinyurl/i.test(text)) {
    return L(
      "This message includes an external link. Open links only if you already trust the person and the site.",
      "تتضمن هذه الرسالة رابطًا خارجيًا. افتح الروابط فقط إذا كنت تثق بالشخص والموقع.",
      "इस संदेश में एक बाहरी लिंक है। लिंक तभी खोलें जब आप व्यक्ति और साइट दोनों पर भरोसा करते हों।",
    );
  }
  return null;
}

export function explainMatch(listing: Listing, have: CategoryId[], want: CategoryId[]) {
  const wantsMine = listing.wantTags.some((tag) => have.includes(tag));
  const iWant = want.includes(listing.category);
  const reasons: Copy[] = [];
  if (iWant) reasons.push(L("Matches your wish list", "يطابق قائمة رغباتك", "आपकी चाहत से मेल खाता है"));
  if (wantsMine) {
    reasons.push(L("Wants something you have", "يريد شيئًا لديك", "उसे वह चाहिए जो आपके पास है"));
  }
  let level: "strong" | "good" | "possible" | null = null;
  if (wantsMine && iWant) level = "strong";
  else if (wantsMine || iWant) level = "good";
  else if (listing.open || listing.cashOk) level = "possible";
  if (level === "possible") {
    reasons.push(
      L(
        "Nearby, and open to a flexible trade",
        "قريب منك ومنفتح على صفقة مرنة",
        "पास में है, और लचीले सौदे के लिए तैयार है",
      ),
    );
  }
  return { level, reasons };
}

export function passesQuery(
  listing: Listing,
  query: SearchQuery,
  owner: Person | undefined,
  have: CategoryId[],
  want: CategoryId[],
): boolean {
  if (listing.unlisted) return false;
  if (query.category !== "any" && listing.category !== query.category) return false;
  if (query.kind !== "any" && listing.kind !== query.kind) return false;
  if (query.city !== "any" && listing.city !== query.city) return false;
  if (listing.km > query.distance && query.city !== "any" && listing.city === query.city) return false;
  if (listing.value < query.min || listing.value > query.max) return false;
  if (query.condition !== "any" && !listing.condition.en.toLowerCase().includes(query.condition)) {
    return false;
  }
  if (query.handoff !== "any" && !listing.handoff.includes(query.handoff)) return false;
  if (query.cash && !listing.cashOk) return false;
  if (query.bundles && !listing.bundlesOk) return false;
  if (query.verified && (!owner || !owner.phone || !owner.email)) return false;
  if (query.days > 0 && listing.days > query.days) return false;
  const match = explainMatch(listing, have, want);
  if (query.have && !match.reasons.some((reason) => reason.en.startsWith("Wants something"))) {
    return false;
  }
  if (query.want && !want.includes(listing.category)) return false;
  if (query.text.trim()) {
    const blob = `${listing.title.en} ${listing.title.ar} ${listing.title.hi} ${listing.description.en} ${listing.area}`.toLowerCase();
    if (!blob.includes(query.text.trim().toLowerCase())) return false;
  }
  return true;
}

export function versionTotals(version: Version): { yours: number; theirs: number } {
  return {
    yours: sideTotal(
      version.your.map((item) => item.value),
      version.yourCash,
    ),
    theirs: sideTotal(
      version.their.map((item) => item.value),
      version.theirCash,
    ),
  };
}

export function tradeStatus(story: Pick<Story, "phase" | "scenario" | "outcome" | "meConfirmed" | "themConfirmed">): TradeStatus | null {
  if (story.outcome === "declined") return "declined";
  if (story.outcome === "withdrawn") return "withdrawn";
  if (story.scenario === "disputed") return "disputed";
  if (story.scenario === "meetup-cancelled") return "cancelled";
  switch (story.phase) {
    case "sent":
      return "proposed";
    case "countered":
      return "countered";
    case "accepted":
      return "accepted";
    case "scheduled":
      return "scheduled";
    case "checkedin":
      return "inprogress";
    case "awaiting":
      return story.meConfirmed && story.themConfirmed ? "completed" : "awaiting";
    case "completed":
    case "reviewed":
      return "completed";
    default:
      return null;
  }
}

export function statusLabel(status: TradeStatus): Copy {
  const labels: Record<TradeStatus, Copy> = {
    proposed: L("Proposed", "مقترحة", "प्रस्तावित"),
    countered: L("Countered", "عرض مقابل", "प्रतिप्रस्ताव"),
    accepted: L("Accepted", "مقبولة", "स्वीकृत"),
    scheduling: L("Scheduling", "تحديد الموعد", "समय तय हो रहा है"),
    scheduled: L("Scheduled", "مجدولة", "निर्धारित"),
    inprogress: L("In progress", "جارٍ التنفيذ", "जारी"),
    awaiting: L("Awaiting confirmation", "بانتظار التأكيد", "पुष्टि की प्रतीक्षा"),
    completed: L("Completed", "مكتملة", "पूरा"),
    cancelled: L("Cancelled", "ملغاة", "रद्द"),
    disputed: L("Disputed", "قيد النزاع", "विवाद में"),
    declined: L("Declined", "مرفوضة", "अस्वीकृत"),
    withdrawn: L("Withdrawn", "مسحوبة", "वापस ली गई"),
  };
  return labels[status];
}

export function handoffLabel(method: Handoff): Copy {
  const labels: Record<Handoff, Copy> = {
    meetup: L("Public meetup", "لقاء في مكان عام", "सार्वजनिक मुलाकात"),
    pickup: L("Pickup", "استلام", "पिकअप"),
    delivery: L("Delivery", "توصيل", "डिलीवरी"),
    shipping: L("Shipping", "شحن", "शिपिंग"),
  };
  return labels[method];
}

export function greeting(country: "AE" | "IN", locale: Locale, name: string): string {
  const timeZone = country === "IN" ? "Asia/Kolkata" : "Asia/Dubai";
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone,
    }).format(new Date()),
  );
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const table: Record<typeof part, Copy> = {
    morning: L("Good morning, {name}", "صباح الخير، {name}", "सुप्रभात, {name}"),
    afternoon: L("Good afternoon, {name}", "مساء الخير، {name}", "नमस्ते, {name}"),
    evening: L("Good evening, {name}", "مساء الخير، {name}", "शुभ संध्या, {name}"),
  };
  return say(locale, table[part], { name });
}

export function phaseAtLeast(phase: Phase, target: Phase): boolean {
  const order: Phase[] = [
    "guest",
    "onboarding",
    "verified",
    "listed",
    "sent",
    "countered",
    "accepted",
    "scheduled",
    "checkedin",
    "awaiting",
    "completed",
    "reviewed",
  ];
  return order.indexOf(phase) >= order.indexOf(target);
}

export function emptyDraft(): Draft {
  return {
    yourIds: [],
    theirIds: [],
    values: {},
    yourCash: 0,
    theirCash: 0,
    message: "",
    place: "",
    date: "",
    method: "meetup",
    conditions: "",
    request: "",
    ack: false,
    mode: "new",
  };
}

export function changedRows(previous: Version, next: Version, locale: Locale, currency: Currency) {
  const rows: { label: string; before: string; after: string; kind: "added" | "removed" | "changed" | "same" }[] = [];
  const push = (label: Copy, before: string, after: string) => {
    rows.push({
      label: say(locale, label),
      before,
      after,
      kind: before === after ? "same" : "changed",
    });
  };
  const prevYour = new Set(previous.your.map((item) => item.id));
  const nextYour = new Set(next.your.map((item) => item.id));
  for (const item of next.your) {
    if (!prevYour.has(item.id)) {
      rows.push({
        label: say(locale, L("Added to your side", "أُضيف إلى طرفك", "आपके पक्ष में जोड़ा गया")),
        before: say(locale, L("Not included", "غير مشمول", "शामिल नहीं")),
        after: `${say(locale, item.title)} · ${money(item.value, currency, locale)}`,
        kind: "added",
      });
    }
  }
  for (const item of previous.your) {
    if (!nextYour.has(item.id)) {
      rows.push({
        label: say(locale, L("Removed from your side", "أُزيل من طرفك", "आपके पक्ष से हटाया गया")),
        before: `${say(locale, item.title)} · ${money(item.value, currency, locale)}`,
        after: say(locale, L("Removed", "أُزيل", "हटाया गया")),
        kind: "removed",
      });
    }
  }
  for (const item of next.your) {
    const old = previous.your.find((entry) => entry.id === item.id);
    if (old && old.value !== item.value) {
      rows.push({
        label: say(locale, L("Value changed", "تغيّرت القيمة", "मूल्य बदला")),
        before: `${say(locale, old.title)} · ${money(old.value, currency, locale)}`,
        after: `${say(locale, item.title)} · ${money(item.value, currency, locale)}`,
        kind: "changed",
      });
    }
  }
  const prevTheir = new Set(previous.their.map((item) => item.id));
  const nextTheir = new Set(next.their.map((item) => item.id));
  for (const item of next.their) {
    if (!prevTheir.has(item.id)) {
      rows.push({
        label: say(locale, L("Added to their side", "أُضيف إلى طرفهم", "उनके पक्ष में जोड़ा गया")),
        before: say(locale, L("Not included", "غير مشمول", "शामिल नहीं")),
        after: `${say(locale, item.title)} · ${money(item.value, currency, locale)}`,
        kind: "added",
      });
    }
  }
  for (const item of previous.their) {
    if (!nextTheir.has(item.id)) {
      rows.push({
        label: say(locale, L("Removed from their side", "أُزيل من طرفهم", "उनके पक्ष से हटाया गया")),
        before: `${say(locale, item.title)} · ${money(item.value, currency, locale)}`,
        after: say(locale, L("Removed", "أُزيل", "हटाया गया")),
        kind: "removed",
      });
    }
  }
  for (const item of next.their) {
    const old = previous.their.find((entry) => entry.id === item.id);
    if (old && old.value !== item.value) {
      rows.push({
        label: say(locale, L("Value changed", "تغيّرت القيمة", "मूल्य बदला")),
        before: `${say(locale, old.title)} · ${money(old.value, currency, locale)}`,
        after: `${say(locale, item.title)} · ${money(item.value, currency, locale)}`,
        kind: "changed",
      });
    }
  }
  push(
    L("Your cash adjustment", "تعديلك النقدي", "आपका नकद समायोजन"),
    money(previous.yourCash, currency, locale),
    money(next.yourCash, currency, locale),
  );
  push(
    L("Their cash adjustment", "تعديلهم النقدي", "उनका नकद समायोजन"),
    money(previous.theirCash, currency, locale),
    money(next.theirCash, currency, locale),
  );
  push(L("Meetup or delivery", "اللقاء أو التوصيل", "मुलाकात या डिलीवरी"), previous.place || "—", next.place || "—");
  push(L("When", "الموعد", "कब"), previous.date || "—", next.date || "—");
  const prevTotals = versionTotals(previous);
  const nextTotals = versionTotals(next);
  push(
    L("Difference", "الفرق", "अंतर"),
    money(Math.abs(prevTotals.yours - prevTotals.theirs), currency, locale),
    money(Math.abs(nextTotals.yours - nextTotals.theirs), currency, locale),
  );
  return rows;
}

export function storyHasTrade(phase: Phase): boolean {
  return phaseAtLeast(phase, "sent");
}
