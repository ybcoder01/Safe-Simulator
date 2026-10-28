import { useState } from "react";
import { L } from "../copy";
import { listings, notifMeta, personById } from "../data";
import { scamWarning, scanPolicy } from "../logic";
import { useApp } from "../state";
import type { ChatMessage } from "../types";
import { Avatar, Disclaimer, EmptyState, ListingCard, Notice, PolicyNotice } from "../ui";
import { Icon } from "../icons";

export function Messages() {
  const app = useApp();
  const ids = Object.keys(app.story.threads);
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Messages", "الرسائل", "संदेश"))}</h1>
      <p className="muted">{app.t(L("Conversations stay here. Agreements do not. If items or cash change, use the proposal.", "المحادثات هنا. الاتفاقات لا. إذا تغيّرت الأغراض أو النقد فاستخدم الاقتراح.", "बातचीत यहाँ रहती है। समझौते नहीं। अगर वस्तुएँ या नकद बदलें तो प्रस्ताव का उपयोग करें।"))}</p>
      {ids.length === 0 ? <EmptyState icon="message" title={app.t(L("No messages", "لا رسائل", "कोई संदेश नहीं"))} body={app.t(L("Message someone from their listing. A chat cannot lock a trade.", "راسل شخصًا من إعلانه. الدردشة لا تثبّت صفقة.", "उनकी लिस्टिंग से संदेश भेजें। चैट सौदा लॉक नहीं करती।"))} /> : ids.map((id) => {
        const person = personById(id);
        const last = app.story.threads[id]?.at(-1);
        if (!person) return null;
        return (
          <button key={id} className="card pad spread" onClick={() => { app.patch({ threadId: id }); app.go("thread"); }}>
            <span className="row"><Avatar person={person} /><span><strong>{app.t(person.name)}</strong><span className="muted small" style={{ display: "block" }}>{last?.textCopy ? app.t(last.textCopy) : last?.warning ? app.t(last.warning) : last?.text}</span></span></span>
            {id === "alex" ? <span className="pill warn">{app.t(L("Caution", "تنبيه", "सावधानी"))}</span> : <Icon name="chevron" />}
          </button>
        );
      })}
    </div>
  );
}

export function Thread() {
  const app = useApp();
  const id = app.story.threadId || (app.country === "AE" ? "rohan" : "priya");
  const person = personById(id);
  const messages = app.story.threads[id] ?? [];
  const [text, setText] = useState("");
  const [confirmScam, setConfirmScam] = useState(false);
  const warning = scamWarning(text);
  const policy = scanPolicy(text);
  const send = () => {
    if (!text.trim()) return;
    if (policy.outcome === "prohibited") return;
    if (warning && !confirmScam) { setConfirmScam(true); return; }
    const next: ChatMessage[] = [...messages, { id: `u-${Date.now()}`, from: "me", kind: "text", text, at: "Now" }];
    if (warning) next.push({ id: `w-${Date.now()}`, from: "system", kind: "warning", text: "", warning, at: "Now" });
    app.patch({ threads: { ...app.story.threads, [id]: next } });
    setText("");
    setConfirmScam(false);
  };
  if (app.story.blocked.includes(id)) {
    return <div className="page narrow"><EmptyState icon="ban" title={app.t(L("You blocked this person", "حظرت هذا الشخص", "आपने इस व्यक्ति को ब्लॉक किया"))} body={app.t(L("They cannot message you or propose a trade.", "لا يمكنه مراسلتك ولا اقتراح صفقة.", "वे आपको संदेश नहीं भेज सकते और न सौदा प्रस्तावित कर सकते हैं।"))} /></div>;
  }
  return (
    <div className="page narrow stack">
      <div className="spread">
        <button className="btn btn-ghost" onClick={() => app.go("messages")}><Icon name="back" /></button>
        <h1>{person ? app.t(person.short) : app.t(L("Conversation", "محادثة", "बातचीत"))}</h1>
        <button className="btn btn-ghost btn-small" onClick={() => app.go("report")}>{app.t(L("Report", "إبلاغ", "रिपोर्ट"))}</button>
      </div>
      {app.story.versions.length > 0 ? <Notice>{app.t(L("A proposal is open. Do not agree to new items, values, or cash in chat. Open the trade to change terms.", "هناك اقتراح مفتوح. لا تتفق على أغراض أو قيم أو نقد جديد في الدردشة. افتح الصفقة لتغيير الشروط.", "एक प्रस्ताव खुला है। चैट में नई वस्तु, मूल्य या नकद पर सहमत न हों। शर्तें बदलने के लिए सौदा खोलें।"))}<button className="btn btn-small" onClick={() => app.go("offer")}>{app.t(L("Open proposal", "افتح الاقتراح", "प्रस्ताव खोलें"))}</button></Notice> : null}
      <div className="stack">
        {messages.map((message) => <Bubble key={message.id} message={message} />)}
        {app.story.versions.map((version) => (
          <button key={version.n} className="card pad stack" onClick={() => app.go("offer")}>
            <strong>{app.t(L("Offer version {n}", "عرض النسخة {n}", "ऑफ़र संस्करण {n}"), { n: version.n })}</strong>
            <span className="muted small">{version.note}</span>
          </button>
        ))}
      </div>
      {warning && confirmScam ? <Notice tone="warn">{app.t(warning)}</Notice> : null}
      {policy.outcome === "prohibited" ? <Notice tone="bad">{policy.message ? app.t(policy.message) : null}</Notice> : null}
      <label className="field"><span className="sr">{app.t(L("Message", "رسالة", "संदेश"))}</span><textarea value={text} onChange={(e) => { setText(e.target.value); setConfirmScam(false); }} /></label>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={send} disabled={policy.outcome === "prohibited"}>{confirmScam ? app.t(L("Send anyway", "أرسل رغم ذلك", "फिर भी भेजें")) : app.t(L("Send", "إرسال", "भेजें"))}</button>
        <button className="btn btn-secondary" onClick={() => { app.patch({ blocked: [...app.story.blocked, id] }); app.notify(app.t(L("Blocked", "تم الحظر", "ब्लॉक किया गया"))); }}>{app.t(L("Block", "حظر", "ब्लॉक करें"))}</button>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const app = useApp();
  const body = message.textCopy ? app.t(message.textCopy) : message.warning ? app.t(message.warning) : message.text;
  if (message.kind === "warning" || message.from === "system") return <Notice tone={message.kind === "warning" ? "warn" : "info"}>{body}</Notice>;
  return <article className="card pad" style={{ marginInlineStart: message.from === "me" ? "18%" : 0, marginInlineEnd: message.from === "them" ? "18%" : 0 }}><p>{body}</p><p className="muted small">{message.at} · {message.from === "me" ? app.t(L("Read", "قُرئت", "पढ़ा गया")) : ""}</p></article>;
}

export function Profile() {
  const app = useApp();
  const person = personById(app.story.profileId) ?? personById(app.meId);
  if (!person) return null;
  const mine = person.id === app.meId;
  const active = listings.filter((listing) => listing.ownerId === person.id && !listing.unlisted);
  return (
    <div className="page stack">
      <div className="spread wrap">
        <div className="row"><Avatar person={person} large /><div><h1>{app.t(person.name)}</h1><p className="muted">{person.area}, {person.city} · {app.t(L("Member since {year}", "عضو منذ {year}", "{year} से सदस्य"), { year: person.since })}</p></div></div>
        {mine ? <button className="btn btn-secondary" onClick={() => app.go("settings")}>{app.t(L("Settings", "الإعدادات", "सेटिंग्स"))}</button> : null}
      </div>
      <p>{mine && app.story.bio ? app.story.bio : app.t(person.bio)}</p>
      <div className="grid-3">
        <article className="card pad"><h2>{person.trades}</h2><p>{app.t(L("Completed trades", "صفقات مكتملة", "पूरे सौदे"))}</p></article>
        <article className="card pad"><h2>{person.rating ? person.rating.toFixed(1) : "—"}</h2><p>{app.t(L("Overall rating", "التقييم العام", "कुल रेटिंग"))}</p></article>
        <article className="card pad"><h2>{person.reviews}</h2><p>{app.t(L("Reviews", "تقييمات", "समीक्षाएँ"))}</p></article>
      </div>
      <div className="grid-2">
        <article className="card pad stack">
          <h2>{app.t(L("Verification", "التوثيق", "सत्यापन"))}</h2>
          <p>{person.phone ? app.t(L("Phone verified", "الهاتف موثّق", "फ़ोन सत्यापित")) : app.t(L("Phone not verified", "الهاتف غير موثّق", "फ़ोन सत्यापित नहीं"))}</p>
          <p>{person.email ? app.t(L("Email verified", "البريد موثّق", "ईमेल सत्यापित")) : app.t(L("Email not verified", "البريد غير موثّق", "ईमेल सत्यापित नहीं"))}</p>
          <p>{app.t(person.identityNote)}</p>
          <p className="muted small">{app.t(L("A badge never means the item is genuine or the estimate is a market price. Documents are not shown.", "الشارة لا تعني أن الغرض أصلي أو أن التقدير سعر سوق. لا تُعرض الوثائق.", "बैज का मतलब नहीं कि वस्तु असली है या अनुमान बाज़ार भाव है। दस्तावेज़ नहीं दिखाए जाते।"))}</p>
          {mine ? <button className="btn btn-secondary" onClick={() => app.go("identity")}>{app.t(L("Identity check", "توثيق الهوية", "पहचान जाँच"))}</button> : null}
        </article>
        <article className="card pad stack">
          <h2>{app.t(L("Reputation, in pieces", "السمعة، مجزأة", "प्रतिष्ठा, टुकड़ों में"))}</h2>
          {person.reviews > 0 ? (
            <>
              <p>{app.t(L("Listing accuracy", "دقة الإعلان", "लिस्टिंग की सटीकता"))}: {person.accuracy.toFixed(1)}</p>
              <p>{app.t(L("Communication", "التواصل", "संवाद"))}: {person.communication.toFixed(1)}</p>
              <p>{app.t(L("Reliability", "الالتزام", "भरोसेमंदी"))}: {person.reliability.toFixed(1)}</p>
            </>
          ) : <p>{app.t(L("No reviews yet. A new profile is not a bad profile.", "لا تقييمات بعد. الملف الجديد ليس ملفًا سيئًا.", "अभी कोई समीक्षा नहीं। नई प्रोफ़ाइल बुरी प्रोफ़ाइल नहीं है।"))}</p>}
          <p>{app.t(person.response)}</p>
          <p>{app.t(person.cancellation)}</p>
          <p>{app.t(L("Wants", "يريد", "चाहते हैं"))}: {app.t(person.wishlist)}</p>
          <p>{app.t(L("Languages", "اللغات", "भाषाएँ"))}: {app.t(person.languages)}</p>
        </article>
      </div>
      {mine ? <p className="muted small num">{app.t(L("Only you see this number: +971 50 412 8831", "أنت فقط ترى هذا الرقم: ‎+971 50 412 8831", "यह नंबर सिर्फ़ आप देखते हैं: +971 50 412 8831"))}</p> : null}
      <h2>{app.t(L("Active listings", "إعلانات نشطة", "सक्रिय लिस्टिंग"))}</h2>
      {active.length === 0 ? <p className="muted">{app.t(L("No public listings.", "لا إعلانات عامة.", "कोई सार्वजनिक लिस्टिंग नहीं।"))}</p> : <div className="grid-cards">{active.map((listing) => <ListingCard key={listing.id} listing={listing} variant="compact" />)}</div>}
      {!mine ? <div className="row"><button className="btn btn-secondary" onClick={() => { app.patch({ threadId: person.id }); app.go("thread"); }}>{app.t(L("Message", "مراسلة", "संदेश"))}</button><button className="btn btn-ghost" onClick={() => app.go("report")}>{app.t(L("Report", "إبلاغ", "रिपोर्ट"))}</button></div> : (
        <div className="row wrap">
          <button className="btn btn-secondary" onClick={() => app.go("manage")}>{app.t(L("Manage listing", "إدارة الإعلان", "लिस्टिंग संभालें"))}</button>
          <button className="btn btn-secondary" onClick={() => app.go("safety")}>{app.t(L("Safety Center", "مركز السلامة", "सुरक्षा केंद्र"))}</button>
          <button className="btn btn-secondary" onClick={() => app.go("favorites")}>{app.t(L("Favorites", "المحفوظات", "सहेजे गए"))}</button>
          <button className="btn btn-secondary" onClick={() => app.go("saved")}>{app.t(L("Saved searches", "بحوث محفوظة", "सहेजी खोजें"))}</button>
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const app = useApp();
  const [bio, setBio] = useState(app.story.bio || (personById(app.meId) ? "" : ""));
  const hit = scanPolicy(bio);
  return (
    <div className="page stack">
      <h1>{app.t(L("Settings and privacy", "الإعدادات والخصوصية", "सेटिंग्स और गोपनीयता"))}</h1>
      <section className="card pad stack">
        <h2>{app.t(L("Language, country, currency", "اللغة والبلد والعملة", "भाषा, देश, मुद्रा"))}</h2>
        <div className="seg">
          <button type="button" aria-pressed={app.locale === "en"} onClick={() => app.setLocale("en")}>English</button>
          <button type="button" aria-pressed={app.locale === "ar"} onClick={() => app.setLocale("ar")}>العربية</button>
          <button type="button" aria-pressed={app.locale === "hi"} onClick={() => app.setLocale("hi")}>हिन्दी</button>
        </div>
        <p>{app.country === "AE" ? "UAE · AED" : "India · INR"}</p>
        <Notice>{app.t(L("Trades between the UAE and India are turned off in this version. Switching country is a different market, not a bridge.", "صفقات الإمارات والهند متوقفة في هذه النسخة. تبديل البلد سوق مختلف لا جسر بينهما.", "इस संस्करण में यूएई और भारत के बीच सौदे बंद हैं। देश बदलना दूसरा बाज़ार है, पुल नहीं।"))}</Notice>
      </section>
      <section className="stack">
        <h2>{app.t(L("Notifications", "التنبيهات", "सूचनाएँ"))}</h2>
        <table className="table">
          <thead><tr><th>{app.t(L("Event", "الحدث", "घटना"))}</th><th>Push</th><th>{app.t(L("Email", "البريد", "ईमेल"))}</th><th>{app.t(L("In app", "داخل التطبيق", "ऐप में"))}</th></tr></thead>
          <tbody>
            {notifMeta.map((row) => {
              const pref = app.story.notif[row.id];
              if (!pref) return null;
              const toggle = (channel: "push" | "email" | "inapp") => app.patch({ notif: { ...app.story.notif, [row.id]: { ...pref, [channel]: !pref[channel] } } });
              return (
                <tr key={row.id}>
                  <td>{app.t(row.label)}</td>
                  <td><input type="checkbox" checked={pref.push} onChange={() => toggle("push")} aria-label="push" /></td>
                  <td><input type="checkbox" checked={pref.email} onChange={() => toggle("email")} aria-label="email" /></td>
                  <td><input type="checkbox" checked={pref.inapp} onChange={() => toggle("inapp")} aria-label="in app" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="card pad stack">
        <h2>{app.t(L("Privacy", "الخصوصية", "गोपनीयता"))}</h2>
        <label className="check"><input type="checkbox" defaultChecked /><span>{app.t(L("Show city and area only", "أظهر المدينة والحي فقط", "सिर्फ़ शहर और इलाका दिखाएँ"))}</span></label>
        <label className="check"><input type="checkbox" defaultChecked disabled /><span>{app.t(L("Share meetup details only after acceptance. This stays on.", "شارك تفاصيل اللقاء بعد القبول فقط. هذا يبقى مفعّلًا.", "मुलाकात का विवरण स्वीकार होने के बाद ही साझा करें। यह चालू रहता है।"))}</span></label>
        <label className="field"><span>{app.t(L("Bio", "نبذة", "परिचय"))}</span><textarea value={bio} onChange={(e) => setBio(e.target.value)} /></label>
        {hit.outcome === "prohibited" ? <Notice tone="bad">{hit.message ? app.t(hit.message) : null}</Notice> : null}
        <button className="btn btn-secondary" disabled={hit.outcome === "prohibited"} onClick={() => { app.patch({ bio }); app.notify(app.t(L("Saved", "حُفظ", "सहेजा गया"))); }}>{app.t(L("Save bio", "حفظ النبذة", "परिचय सहेजें"))}</button>
      </section>
      <section className="stack">
        <h2>{app.t(L("Blocked people", "الأشخاص المحظورون", "ब्लॉक किए लोग"))}</h2>
        {app.story.blocked.length === 0 ? <p className="muted">{app.t(L("No one is blocked.", "لا أحد محظور.", "कोई ब्लॉक नहीं है।"))}</p> : app.story.blocked.map((id) => <p key={id}>{personById(id) ? app.t(personById(id)!.name) : id}</p>)}
        <button className="btn btn-ghost" onClick={() => app.notify(app.t(L("Account closure is a request to support, not an instant delete in this prototype.", "إغلاق الحساب طلب للدعم، وليس حذفًا فوريًا في هذا النموذج.", "खाता बंद करना सहायता से अनुरोध है, इस प्रोटोटाइप में तुरंत मिटना नहीं।")))}>{app.t(L("Close account", "إغلاق الحساب", "खाता बंद करें"))}</button>
      </section>
    </div>
  );
}

export function Notifications() {
  const app = useApp();
  const rows = [
    app.story.phase === "guest" ? null : { title: L("Rohan’s X-T30 matches what you want", "كاميرا روهان تطابق ما تريد", "रोहन का X-T30 आपकी चाहत से मेल खाता है"), screen: "listing" as const },
    { title: L("Saved search: cameras under AED 2,500", "بحث محفوظ: كاميرات أقل من 2500 درهم", "सहेजी खोज: 2,500 दिरहम से कम के कैमरे"), screen: "saved" as const },
    app.story.versions.length ? { title: L("A proposal version is waiting", "نسخة اقتراح بانتظارك", "एक प्रस्ताव संस्करण इंतज़ार कर रहा है"), screen: "offer" as const } : null,
    app.story.meetup ? { title: L("Meetup reminder · Dubai Mall", "تذكير اللقاء · دبي مول", "मुलाकात की याद · दुबई मॉल"), screen: "checkin" as const } : null,
    app.story.reviewDone ? null : app.story.meConfirmed ? { title: L("Review request", "طلب تقييم", "समीक्षा का अनुरोध"), screen: "review" as const } : null,
  ].filter((item): item is { title: ReturnType<typeof L>; screen: "listing" | "saved" | "offer" | "checkin" | "review" } => Boolean(item));
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Notifications", "التنبيهات", "सूचनाएँ"))}</h1>
      {rows.length === 0 ? <EmptyState icon="bell" title={app.t(L("You are up to date", "أنت على اطلاع", "आप अप टू डेट हैं"))} body={app.t(L("Matches, proposals, meetups, and safety check-ins will show up here.", "ستظهر هنا المطابقات والاقتراحات واللقاءات وتسجيل السلامة.", "मेल, प्रस्ताव, मुलाकात और सुरक्षा चेक-इन यहाँ दिखेंगे।"))} /> : rows.map((row) => (
        <button key={row.title.en} className="card pad spread" onClick={() => app.go(row.screen)}><span>{app.t(row.title)}</span><Icon name="chevron" /></button>
      ))}
      <button className="btn btn-secondary" onClick={() => app.go("settings")}>{app.t(L("Notification controls", "إعدادات التنبيه", "सूचना नियंत्रण"))}</button>
    </div>
  );
}

export function Safety() {
  const app = useApp();
  const emergency = app.country === "IN" ? "112" : "999";
  return (
    <div className="page narrow stack prose">
      <h1>{app.t(L("Safety Center", "مركز السلامة", "सुरक्षा केंद्र"))}</h1>
      <p>{app.t(L("SwapFair helps you see a trade clearly. It does not guarantee a valuation, authenticity, condition, payment, or that the meetup will go well.", "تساعدك SwapFair على رؤية الصفقة بوضوح. لا تضمن التقييم ولا الأصالة ولا الحالة ولا الدفع ولا أن يسير اللقاء على ما يرام.", "SwapFair सौदा साफ़ देखने में मदद करता है। यह मूल्यांकन, असलीपन, हालत, भुगतान, या मुलाकात के अच्छे नतीजे की गारंटी नहीं देता।"))}</p>
      <h2>{app.t(L("Meeting in person", "اللقاء الشخصي", "व्यक्तिगत मुलाकात"))}</h2>
      <p>{app.t(L("Use a public place. Keep your home address private. Share the plan with someone you trust. Do not carry extra cash. Inspect before you confirm.", "استخدم مكانًا عامًا. أبقِ عنوان منزلك خاصًا. شارك الخطة مع شخص تثق به. لا تحمل نقدًا زائدًا. افحص قبل أن تؤكد.", "सार्वजनिक जगह का उपयोग करें। घर का पता निजी रखें। योजना किसी भरोसेमंद व्यक्ति के साथ साझा करें। अतिरिक्त नकद न ले जाएँ। पुष्टि से पहले जाँचें।"))}</p>
      <h2>{app.t(L("Shipping", "الشحن", "शिपिंग"))}</h2>
      <p>{app.t(L("Agree who pays. Do not ship prohibited or hazardous goods. This version does not insure delivery, and it does not allow UAE–India trades.", "اتفقا على من يدفع. لا تشحن أغراضًا ممنوعة أو خطرة. هذه النسخة لا تؤمّن التوصيل ولا تسمح بصفقات الإمارات والهند.", "तय करें कौन भुगतान करेगा। प्रतिबंधित या खतरनाक सामान न भेजें। यह संस्करण डिलीवरी का बीमा नहीं करता, और यूएई–भारत सौदे नहीं होने देता।"))}</p>
      <a className="btn btn-danger" href={`tel:${emergency}`}>{app.t(L("Call emergency {number}", "اتصل بالطوارئ {number}", "आपातकाल {number} पर कॉल करें"), { number: emergency })}</a>
      <button className="btn btn-secondary" onClick={() => app.go("policy")}>{app.t(L("Prohibited listings policy", "سياسة الإعلانات الممنوعة", "प्रतिबंधित लिस्टिंग नीति"))}</button>
      <button className="btn btn-ghost" onClick={() => app.go("admin")}>{app.t(L("Moderator tools", "أدوات الإشراف", "मॉडरेटर उपकरण"))}</button>
    </div>
  );
}

export function Policy() {
  const app = useApp();
  const blocks = [
    L("Weapons and ammunition", "الأسلحة والذخيرة", "हथियार और गोला-बारूद"),
    L("Medicines and prescription products", "الأدوية والمنتجات التي تحتاج وصفة", "दवाएँ और नुस्खे वाले उत्पाद"),
    L("Alcohol and tobacco", "الكحول والتبغ", "शराब और तंबाकू"),
    L("Controlled substances", "المواد الخاضعة للرقابة", "नियंत्रित पदार्थ"),
    L("Cryptocurrency and financial instruments", "العملات المشفرة والأدوات المالية", "क्रिप्टोकरेंसी और वित्तीय साधन"),
    L("Stolen property and counterfeits", "المسروقات والمقلدات", "चोरी का माल और नकली सामान"),
    L("Hazardous materials", "المواد الخطرة", "खतरनाक सामग्री"),
    L("Identity documents and one-time codes", "وثائق الهوية والرموز لمرة واحدة", "पहचान दस्तावेज़ और वन-टाइम कोड"),
  ];
  return (
    <div className="page narrow stack prose">
      <h1>{app.t(L("Prohibited and restricted listings", "الإعلانات الممنوعة والمقيدة", "प्रतिबंधित और सीमित लिस्टिंग"))}</h1>
      <p>{app.t(L("These rules apply to what you offer and what you request: listings, wish lists, extra items, counteroffers, profile text, photos, and messages.", "تنطبق هذه القواعد على ما تعرضه وما تطلبه: الإعلانات وقوائم الرغبات والأغراض الإضافية والعروض المقابلة ونص الملف والصور والرسائل.", "ये नियम उस पर लागू होते हैं जो आप देते हैं और जो माँगते हैं: लिस्टिंग, चाहत सूची, अतिरिक्त वस्तुएँ, प्रतिप्रस्ताव, प्रोफ़ाइल पाठ, फ़ोटो और संदेश।"))}</p>
      <p>{app.t(L("You cannot list an ordinary item and ask for alcohol, tobacco, weapons, cryptocurrency, or another prohibited item in exchange.", "لا يمكنك إدراج غرض عادي وطلب الكحول أو التبغ أو الأسلحة أو العملات المشفرة أو غرض ممنوع آخر في المقابل.", "आप एक साधारण वस्तु सूचीबद्ध करके बदले में शराब, तंबाकू, हथियार, क्रिप्टो या कोई और प्रतिबंधित वस्तु नहीं माँग सकते।"))}</p>
      <ul>{blocks.map((item) => <li key={item.en}>{app.t(item)}</li>)}</ul>
      <h2>{app.t(L("Three outcomes", "ثلاث نتائج", "तीन नतीजे"))}</h2>
      <p><strong>{app.t(L("Allowed.", "مسموح.", "अनुमति."))}</strong> {app.t(L("Publish immediately.", "يُنشر فورًا.", "तुरंत प्रकाशित।"))}</p>
      <p><strong>{app.t(L("Needs review.", "يحتاج مراجعة.", "समीक्षा चाहिए।"))}</strong> {app.t(L("We save it, tell you review is pending, and do not accuse you.", "نحفظه ونخبرك أن المراجعة معلّقة ولا نتهمك.", "हम उसे सहेजते हैं, बताते हैं कि समीक्षा लंबित है, और आरोप नहीं लगाते।"))}</p>
      <p><strong>{app.t(L("Prohibited.", "ممنوع.", "प्रतिबंधित।"))}</strong> {app.t(L("We block publication, name the category, say what to change, link the policy, and allow an appeal when that is appropriate.", "نمنع النشر ونسمّي الفئة ونوضح ما يمكن تغييره ونربط السياسة ونسمح بالاعتراض عند الاقتضاء.", "हम प्रकाशन रोकते हैं, श्रेणी बताते हैं, बदलाव समझाते हैं, नीति जोड़ते हैं, और उचित होने पर अपील देते हैं।"))}</p>
      <PolicyNotice />
      <p>{app.t(L("Restricted categories stay unavailable until the right verification exists. This version has no escrow.", "تبقى الفئات المقيدة غير متاحة حتى يتوفر التوثيق المناسب. لا يوجد ضمان دفع في هذه النسخة.", "सीमित श्रेणियाँ तब तक बंद रहती हैं जब तक सही सत्यापन मौजूद न हो। इस संस्करण में एस्क्रो नहीं है।"))}</p>
      <Disclaimer />
    </div>
  );
}

const reportReasons = [
  L("Prohibited item", "غرض ممنوع", "प्रतिबंधित वस्तु"),
  L("Counterfeit product", "منتج مقلد", "नकली उत्पाद"),
  L("Stolen property", "ملكية مسروقة", "चोरी का माल"),
  L("Scam or payment request", "احتيال أو طلب دفع", "धोखा या भुगतान माँग"),
  L("Misleading description", "وصف مضلل", "भ्रामक विवरण"),
  L("Harassment", "تحرش", "उत्पीड़न"),
  L("Dangerous behaviour", "سلوك خطير", "खतरनाक व्यवहार"),
  L("Intellectual-property infringement", "انتهاك ملكية فكرية", "बौद्धिक संपदा का उल्लंघन"),
  L("Underage user", "مستخدم دون السن", "नाबालिग उपयोगकर्ता"),
  L("Other", "أخرى", "अन्य"),
];

export function Report() {
  const app = useApp();
  const [reason, setReason] = useState(reportReasons[1]?.en ?? "Counterfeit");
  const [note, setNote] = useState(app.t(L("The description compares the watch to a Submariner, but the title names no brand and there are no papers.", "يقارن الوصف الساعة بصبمارينر، لكن العنوان لا يذكر علامة ولا توجد أوراق.", "विवरण घड़ी की तुलना सबमरीनर से करता है, पर शीर्षक में कोई ब्रांड नहीं और कागज़ नहीं हैं।")));
  const [done, setDone] = useState(app.story.reportId);
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Report", "بلاغ", "रिपोर्ट"))}</h1>
      {done ? <Notice tone="good" title={app.t(L("Case {id}", "البلاغ {id}", "मामला {id}"), { id: done })}>{app.t(L("We saved a snapshot of the listing and the proposal. Your name is not shown to the other person. You can check status here.", "حفظنا لقطة من الإعلان والاقتراح. لا يُعرض اسمك للطرف الآخر. يمكنك متابعة الحالة هنا.", "हमने लिस्टिंग और प्रस्ताव का स्नैपशॉट सहेजा। आपका नाम दूसरे व्यक्ति को नहीं दिखेगा। स्थिति यहाँ देख सकते हैं।"))}</Notice> : null}
      <label className="field"><span>{app.t(L("What happened?", "ماذا حدث؟", "क्या हुआ?"))}</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>{reportReasons.map((item) => <option key={item.en} value={item.en}>{app.t(item)}</option>)}</select>
      </label>
      <label className="field"><span>{app.t(L("What should a moderator see?", "ماذا ينبغي أن يرى المشرف؟", "मॉडरेटर को क्या देखना चाहिए?"))}</span><textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <p className="muted small">{app.t(L("You can attach screenshots. This prototype stores the note only.", "يمكنك إرفاق لقطات. هذا النموذج يحفظ الملاحظة فقط.", "आप स्क्रीनशॉट जोड़ सकते हैं। यह प्रोटोटाइप सिर्फ़ नोट रखता है।"))}</p>
      <label className="check"><input type="checkbox" /><span>{app.t(L("Block this person as well", "احظر هذا الشخص أيضًا", "इस व्यक्ति को भी ब्लॉक करें"))}</span></label>
      <button className="btn btn-primary" onClick={() => { const id = "SF-48219"; app.patch({ reportId: id }); setDone(id); }}>{app.t(L("Submit report", "إرسال البلاغ", "रिपोर्ट भेजें"))}</button>
    </div>
  );
}

const disputeReasons = [
  L("Item not as described", "الغرض ليس كما وُصف", "वस्तु विवरण के अनुसार नहीं"),
  L("Item not received", "لم يُستلم الغرض", "वस्तु नहीं मिली"),
  L("Person did not attend", "لم يحضر الشخص", "व्यक्ति नहीं आया"),
  L("Cash-adjustment disagreement", "خلاف على التعديل النقدي", "नकद समायोजन पर असहमति"),
  L("Damaged item", "غرض تالف", "क्षतिग्रस्त वस्तु"),
  L("Counterfeit item", "غرض مقلد", "नकली वस्तु"),
  L("Safety incident", "حادث سلامة", "सुरक्षा घटना"),
  L("Other", "أخرى", "अन्य"),
];

export function Dispute() {
  const app = useApp();
  const [reason, setReason] = useState(disputeReasons[0]?.en ?? "Other");
  const id = app.story.disputeId;
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Dispute", "نزاع", "विवाद"))}</h1>
      <Notice tone="warn">{app.t(L("SwapFair does not promise a refund or reimbursement. This version has no escrow and no payment protection.", "لا تعد SwapFair باسترداد أو تعويض. لا يوجد ضمان دفع في هذه النسخة.", "SwapFair रिफंड या भरपाई का वादा नहीं करता। इस संस्करण में एस्क्रो या भुगतान सुरक्षा नहीं है।"))}</Notice>
      {id ? <Notice tone="info" title={id}>{app.t(L("Status: in review. We kept the accepted proposal snapshot.", "الحالة: قيد المراجعة. احتفظنا بلقطة الاقتراح المقبول.", "स्थिति: समीक्षा में। हमने स्वीकृत प्रस्ताव का स्नैपशॉट रखा।"))}</Notice> : null}
      <label className="field"><span>{app.t(L("What went wrong?", "ماذا حدث؟", "क्या गड़बड़ हुई?"))}</span>
        <select value={reason} onChange={(e) => setReason(e.target.value)}>{disputeReasons.map((item) => <option key={item.en}>{app.t(item)}</option>)}</select>
      </label>
      <label className="field"><span>{app.t(L("What did you expect, and what happened?", "ماذا توقعت، وماذا حدث؟", "आपको क्या उम्मीद थी, और क्या हुआ?"))}</span><textarea defaultValue="" /></label>
      <button className="btn btn-primary" onClick={() => { app.patch({ disputeId: "SF-19042", scenario: "disputed", disputeReason: reason }); }}>{app.t(L("Submit dispute", "إرسال النزاع", "विवाद भेजें"))}</button>
      <button className="btn btn-secondary" onClick={() => app.go("workspace")}>{app.t(L("Back to the trade", "العودة إلى الصفقة", "सौदे पर वापस"))}</button>
    </div>
  );
}
