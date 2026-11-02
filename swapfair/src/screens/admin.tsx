import { useState } from "react";
import { L, type Copy } from "../copy";
import { useApp } from "../state";
import { Notice } from "../ui";

type CaseFile = {
  id: string;
  queue: Copy;
  title: Copy;
  user: string;
  offered: Copy;
  requested: Copy;
  signals: Copy[];
  policy: Copy;
  recommendation: Copy;
  violations: Copy;
  history: Copy[];
};

const cases: CaseFile[] = [
  {
    id: "SF-1044",
    queue: L("Needs review", "يحتاج مراجعة", "समीक्षा चाहिए"),
    title: L("Omron blood pressure monitor", "جهاز ضغط أومرون", "ओमरोन ब्लड प्रेशर मॉनिटर"),
    user: "Meera Kapoor · Dubai",
    offered: L("Used home monitor", "جهاز منزلي مستعمل", "इस्तेमाल किया घरेलू मॉनिटर"),
    requested: L("Open to offers", "منفتحة على العروض", "ऑफ़र के लिए खुली"),
    signals: [L("Category is close to a medical device", "الفئة قريبة من جهاز طبي", "श्रेणी चिकित्सा उपकरण के करीब है"), L("No prohibited keyword", "لا كلمة ممنوعة", "कोई प्रतिबंधित शब्द नहीं")],
    policy: L("Possibly regulated goods. A person decides. The signal is not the decision.", "أغراض قد تكون خاضعة لتنظيم. يقرر شخص. الإشارة ليست القرار.", "संभवतः विनियमित वस्तु। फ़ैसला व्यक्ति करता है। संकेत फ़ैसला नहीं है।"),
    recommendation: L("Ask for a clearer description, or approve if it is only a consumer monitor.", "اطلب وصفًا أوضح، أو اقبل إن كان جهازًا منزليًا فقط.", "साफ़ विवरण माँगें, या स्वीकार करें अगर यह सिर्फ़ घरेलू मॉनिटर है।"),
    violations: L("None", "لا يوجد", "कोई नहीं"),
    history: [L("Saved by the listing check", "حُفظ عبر فحص الإعلان", "लिस्टिंग जाँच ने सहेजा"), L("Waiting for a moderator", "بانتظار مشرف", "मॉडरेटर की प्रतीक्षा")],
  },
  {
    id: "SF-1102",
    queue: L("Prohibited keyword", "كلمة ممنوعة", "प्रतिबंधित शब्द"),
    title: L("Xanax strips, sealed", "شرائط زاناكس مغلقة", "ज़ैनैक्स स्ट्रिप्स, सील"),
    user: "New account · Ajman",
    offered: L("Prescription medicine", "دواء بوصفة", "नुस्खे की दवा"),
    requested: L("Cash or a phone", "نقد أو هاتف", "नकद या फ़ोन"),
    signals: [L("Title matches a medicine rule", "العنوان يطابق قاعدة دواء", "शीर्षक दवा नियम से मेल खाता है")],
    policy: L("Medicines and prescription products cannot be offered or requested.", "لا يمكن عرض الأدوية التي تحتاج وصفة ولا طلبها.", "नुस्खे वाली दवाएँ न दी जा सकती हैं न माँगी।"),
    recommendation: L("Reject and explain the category. Do not publish.", "ارفض واشرح الفئة. لا تنشر.", "अस्वीकार करें और श्रेणी समझाएँ। प्रकाशित न करें।"),
    violations: L("First attempt", "المحاولة الأولى", "पहली कोशिश"),
    history: [L("Blocked before publish", "مُنع قبل النشر", "प्रकाशन से पहले रोका गया")],
  },
  {
    id: "SF-48219",
    queue: L("User report", "بلاغ مستخدم", "उपयोगकर्ता रिपोर्ट"),
    title: L("Stainless sports watch", "ساعة رياضية ستانلس", "स्टेनलेस स्पोर्ट्स घड़ी"),
    user: "Omar Haddad · Deira",
    offered: L("Watch estimated at AED 4,500, brand unnamed", "ساعة مقدرة بـ 4500 درهم بلا علامة", "4,500 दिरहम अनुमान, ब्रांड नहीं"),
    requested: L("Open to offers", "منفتح على العروض", "ऑफ़र के लिए खुला"),
    signals: [L("Reporter says the description borrows a famous model name", "يقول المبلّغ إن الوصف يستعير اسم طراز شهير", "रिपोर्टर कहता है विवरण एक प्रसिद्ध मॉडल का नाम उधार लेता है"), L("Low listing-accuracy history", "سجل دقة إعلان منخفض", "लिस्टिंग सटीकता का कम इतिहास")],
    policy: L("Counterfeit goods. The report is the reason to look, not a score.", "البضائع المقلدة. البلاغ سبب للنظر لا درجة.", "नकली सामान। रिपोर्ट देखने का कारण है, कोई स्कोर नहीं।"),
    recommendation: L("Request clearer proof of authenticity or remove the listing.", "اطلب إثبات أصالة أوضح أو أزل الإعلان.", "असली होने का साफ़ प्रमाण माँगें या लिस्टिंग हटाएँ।"),
    violations: L("One earlier report on a completed trade", "بلاغ سابق على صفقة مكتملة", "एक पूरे सौदे पर पहले की रिपोर्ट"),
    history: [L("Report SF-48219 opened", "فُتح البلاغ SF-48219", "रिपोर्ट SF-48219 खुली"), L("Listing snapshot stored", "حُفظت لقطة الإعلان", "लिस्टिंग स्नैपशॉट सहेजा गया")],
  },
  {
    id: "SF-19042",
    queue: L("Dispute", "نزاع", "विवाद"),
    title: L("Camera strap missing at meetup", "حزام الكاميرا مفقود عند اللقاء", "मुलाकात पर कैमरा स्ट्रैप गायब"),
    user: "Layla Al Mazrouei · Dubai",
    offered: L("iPad Air", "آيباد آير", "आईपैड एयर"),
    requested: L("X-T30 and strap, version 2", "X-T30 والحزام، النسخة 2", "X-T30 और स्ट्रैप, संस्करण 2"),
    signals: [L("Accepted version included the strap", "النسخة المقبولة تضمنت الحزام", "स्वीकृत संस्करण में स्ट्रैप था")],
    policy: L("Item not as described. No refund is promised.", "الغرض ليس كما وُصف. لا وعد بالاسترداد.", "वस्तु विवरण के अनुसार नहीं। रिफंड का वादा नहीं।"),
    recommendation: L("Ask both people for photos from the meetup. Do not invent a payout.", "اطلب صور اللقاء من الطرفين. لا تخترع تعويضًا.", "दोनों से मुलाकात की फ़ोटो माँगें। भुगतान गढ़ें नहीं।"),
    violations: L("None for either person", "لا مخالفات للطرفين", "किसी पर उल्लंघन नहीं"),
    history: [L("Dispute opened from the workspace", "فُتح النزاع من مساحة الصفقة", "विवाद कार्यक्षेत्र से खुला")],
  },
  {
    id: "SF-3310",
    queue: L("Flagged message", "رسالة مُعلَّمة", "चिह्नित संदेश"),
    title: L("WhatsApp payment before meeting", "دفع عبر واتساب قبل اللقاء", "मिलने से पहले व्हाट्सऐप भुगतान"),
    user: "Alex P. · Al Barsha",
    offered: L("No listing", "لا إعلان", "कोई लिस्टिंग नहीं"),
    requested: L("Advance transfer and an Emirates ID photo", "تحويل مسبق وصورة هوية", "अग्रिम ट्रांसफ़र और एमिरेट्स आईडी फ़ोटो"),
    signals: [L("Off-platform payment language", "لغة دفع خارج المنصة", "प्लेटफ़ॉर्म के बाहर भुगतान की भाषा"), L("Identity document request", "طلب وثيقة هوية", "पहचान दस्तावेज़ की माँग")],
    policy: L("Scam and identity-document requests. Tell the member what was risky without exposing the detector.", "احتيال وطلب وثائق هوية. أخبر العضو بالخطر دون كشف أداة الرصد.", "धोखा और पहचान दस्तावेज़ की माँग। सदस्य को खतरा बताएँ, डिटेक्टर नहीं।"),
    recommendation: L("Warn, and restrict new proposals while the case is open.", "حذّر، وقيّد الاقتراحات الجديدة أثناء فتح القضية.", "चेतावनी दें, और मामला खुला रहने तक नए प्रस्ताव सीमित करें।"),
    violations: L("New account", "حساب جديد", "नया खाता"),
    history: [L("Warnings shown in the thread", "ظهرت التنبيهات في المحادثة", "थ्रेड में चेतावनियाँ दिखीं")],
  },
];

const actions = [
  L("Approve", "قبول", "स्वीकार"),
  L("Request changes", "طلب تعديل", "बदलाव माँगें"),
  L("Reject", "رفض", "अस्वीकार"),
  L("Remove", "إزالة", "हटाएँ"),
  L("Warn", "تحذير", "चेतावनी"),
  L("Restrict", "تقييد", "सीमित करें"),
  L("Suspend", "إيقاف", "निलंबित"),
  L("Permanently ban", "حظر دائم", "स्थायी प्रतिबंध"),
  L("Escalate", "تصعيد", "आगे बढ़ाएँ"),
  L("Restore", "استعادة", "बहाल करें"),
];

export function Admin() {
  const app = useApp();
  const [current, setCurrent] = useState(cases[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [log, setLog] = useState<string[]>([app.t(L("Opened the queue", "فُتحت القائمة", "कतार खोली गई"))]);
  const file = cases.find((item) => item.id === current) ?? cases[0];
  if (!file) return null;
  return (
    <div className="page wide stack">
      <div className="spread wrap">
        <div>
          <p className="kicker">SwapFair</p>
          <h1>{app.t(L("Moderation", "الإشراف", "मॉडरेशन"))}</h1>
        </div>
        <button className="btn btn-secondary" onClick={() => app.go("home")}>{app.t(L("Exit", "خروج", "बाहर"))}</button>
      </div>
      <div className="grid-3">
        <article className="card pad stat"><span className="muted">{app.t(L("Pending", "معلّق", "लंबित"))}</span><strong>18</strong></article>
        <article className="card pad stat"><span className="muted">{app.t(L("Median review", "متوسط المراجعة", "माध्य समीक्षा"))}</span><strong>2.4h</strong></article>
        <article className="card pad stat"><span className="muted">{app.t(L("Appeals overturned", "اعتراضات قُبلت", "अपील पलटीं"))}</span><strong>6%</strong></article>
      </div>
      <div className="admin">
        <div className="stack">
          {cases.map((item) => (
            <button key={item.id} className="card pad stack" onClick={() => setCurrent(item.id)} aria-current={item.id === file.id}>
              <span className="pill">{app.t(item.queue)}</span>
              <strong>{app.t(item.title)}</strong>
              <span className="muted small">{item.id} · {item.user}</span>
            </button>
          ))}
        </div>
        <article className="card pad stack">
          <p className="kicker">{file.id}</p>
          <h2>{app.t(file.title)}</h2>
          <p>{file.user}</p>
          <div className="grid-2">
            <p><strong>{app.t(L("Offered", "المعروض", "दिया गया"))}</strong><br />{app.t(file.offered)}</p>
            <p><strong>{app.t(L("Requested", "المطلوب", "माँगा गया"))}</strong><br />{app.t(file.requested)}</p>
          </div>
          <h3>{app.t(L("Signals, not a verdict", "إشارات لا حكم", "संकेत, फ़ैसला नहीं"))}</h3>
          <ul>{file.signals.map((signal) => <li key={signal.en}>{app.t(signal)}</li>)}</ul>
          <Notice title={app.t(L("Policy", "السياسة", "नीति"))}>{app.t(file.policy)}</Notice>
          <p><strong>{app.t(L("Suggested next step", "الخطوة المقترحة", "सुझाया अगला कदम"))}</strong> {app.t(file.recommendation)}</p>
          <p><strong>{app.t(L("Earlier violations", "مخالفات سابقة", "पहले के उल्लंघन"))}</strong> {app.t(file.violations)}</p>
          <h3>{app.t(L("Audit", "السجل", "ऑडिट"))}</h3>
          <ul>{file.history.map((line) => <li key={line.en}>{app.t(line)}</li>)}{log.map((line) => <li key={line}>{line}</li>)}</ul>
          <label className="field"><span>{app.t(L("Moderator note", "ملاحظة المشرف", "मॉडरेटर नोट"))}</span><textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="row wrap">
            {actions.map((action) => (
              <button key={action.en} className={action.en === "Permanently ban" ? "btn btn-danger btn-small" : "btn btn-secondary btn-small"} onClick={() => {
                const line = `${app.t(action)} · ${file.id}`;
                if (action.en === "Permanently ban" && !window.confirm(app.t(L("Ban this account? You can still restore it from the audit log in this prototype.", "حظر هذا الحساب؟ يمكنك استعادته من السجل في هذا النموذج.", "यह खाता प्रतिबंधित करें? इस प्रोटोटाइप में ऑडिट से बहाल कर सकते हैं।")))) return;
                setLog((prev) => [line, ...prev]);
                setNote("");
              }}>{app.t(action)}</button>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
