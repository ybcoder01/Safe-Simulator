import { useState } from "react";
import { L } from "../copy";
import { categories, cities, listings } from "../data";
import { money } from "../logic";
import { useApp } from "../state";
import { BalanceBar, Disclaimer, ListingCard } from "../ui";
import { Icon, Logo } from "../icons";

export function Landing() {
  const app = useApp();
  const samples = listings.filter((listing) => listing.country === "AE" && !listing.unlisted && !listing.committed).slice(0, 3);
  return (
    <div className="page stack-lg">
      <div className="spread wrap">
        <button className="brand" onClick={() => app.go("landing")}><Logo /> SwapFair</button>
        <div className="row wrap">
          <button className="btn btn-ghost btn-small" onClick={() => app.setLocale(app.locale === "en" ? "ar" : app.locale === "ar" ? "hi" : "en")}>
            {app.locale === "en" ? "العربية" : app.locale === "ar" ? "हिन्दी" : "English"}
          </button>
          <button className="btn btn-secondary btn-small" onClick={() => { app.patch({ authMode: "signin" }); app.go("auth"); }}>{app.t(L("Sign in", "دخول", "साइन इन"))}</button>
        </div>
      </div>
      <section className="hero">
        <div className="stack">
          <p className="kicker">{app.t(L("Peer-to-peer barter · UAE and India", "مقايضة بين الناس · الإمارات والهند", "लोगों के बीच बार्टर · यूएई और भारत"))}</p>
          <h1>{app.t(L("Trade what you have for what you actually need.", "بادل ما لديك بما تحتاجه فعلًا.", "जो आपके पास है, उसे उससे बदलें जिसकी आपको सच में ज़रूरत है।"))}</h1>
          <p className="lead">{app.t(L(
            "Not a one-for-one swap. Each listing carries an estimate. A proposal adds items, removes them, or uses a cash adjustment until both people can see the difference.",
            "ليست مبادلة غرض بغرض. كل إعلان يحمل تقديرًا. يضيف الاقتراح أغراضًا أو يحذفها أو يستخدم تعديلًا نقديًا حتى يرى الطرفان الفرق.",
            "यह एक के बदले एक नहीं है। हर लिस्टिंग पर एक अनुमान होता है। प्रस्ताव में वस्तुएँ जुड़ती हैं, हटती हैं, या नकद समायोजन से दोनों को अंतर दिखता है।",
          ))}</p>
          <div className="row wrap">
            <button className="btn btn-primary" onClick={() => { app.patch({ authMode: "signup" }); app.go("auth"); }}>{app.t(L("Start bartering", "ابدأ المقايضة", "बार्टर शुरू करें"))}</button>
            <button className="btn btn-secondary" onClick={() => app.jumpJourney(8)}>{app.t(L("See a trade get built", "شاهد كيف تُبنى صفقة", "देखें सौदा कैसे बनता है"))}</button>
          </div>
        </div>
        <article className="card pad example stack">
          <p className="kicker">{app.t(L("Example trade", "مثال صفقة", "उदाहरण सौदा"))}</p>
          <div className="spread"><span>Ahmed · {app.t(L("Gaming console", "منصة ألعاب", "गेमिंग कंसोल"))}</span><strong className="num">AED 900</strong></div>
          <div className="spread"><span>Sara · {app.t(L("Tablet", "جهاز لوحي", "टैबलेट"))}</span><strong className="num">AED 650</strong></div>
          <div className="spread"><span>Sara · {app.t(L("Cash adjustment", "تعديل نقدي", "नकद समायोजन"))}</span><strong className="num">AED 250</strong></div>
          <BalanceBar yours={900} theirs={900} currency="AED" />
          <Disclaimer />
        </article>
      </section>
      <section className="grid-3">
        {[
          [L("List one thing", "أدرج غرضًا واحدًا", "एक चीज़ सूचीबद्ध करें"), L("An item or a clearly described service. Say what you would take in return.", "غرض أو خدمة موصوفة بوضوح. قل ما تقبل مقابلها.", "एक वस्तु या साफ़ सेवा। बताएँ बदले में क्या लेंगे।")],
          [L("Find a fit", "اعثر على توافق", "मेल खोजें"), L("Matches are explained in words: they want something you have, or you want what they listed.", "تُفسَّر المطابقات بكلام واضح: يريدون ما لديك، أو تريد ما أدرجوه.", "मेल शब्दों में समझाया जाता है: उन्हें वह चाहिए जो आपके पास है, या आप वह चाहते हैं जो उन्होंने डाला है।")],
          [L("Balance it", "وازنها", "संतुलित करें"), L("Add, remove, adjust cash, or accept a difference. Unequal is allowed when both people agree.", "أضف أو احذف أو عدّل النقد أو اقبل الفرق. عدم التساوي مسموح إذا وافق الطرفان.", "जोड़ें, हटाएँ, नकद बदलें, या अंतर स्वीकार करें। असमान सौदा तब ठीक है जब दोनों मानें।")],
        ].map((pair) => {
          const title = pair[0];
          const body = pair[1];
          if (!title || !body) return null;
          return (
            <article key={title.en} className="card pad stack">
              <h2>{app.t(title)}</h2>
              <p className="muted">{app.t(body)}</p>
            </article>
          );
        })}
      </section>
      <section className="stack">
        <h2>{app.t(L("Nearby, not endless", "قريب منك، لا موجة بلا نهاية", "पास की चीज़ें, अंतहीन फ़ीड नहीं"))}</h2>
        <div className="grid-cards">
          {samples.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
        </div>
      </section>
      <section className="card pad stack">
        <h2>{app.t(L("Safe without being stiff", "آمن بلا تكلّف", "सुरक्षित, बिना कठोरता के"))}</h2>
        <div className="grid-3">
          {[
            [L("18 and over", "18 عامًا فأكثر", "18 वर्ष और अधिक"), L("SwapFair is not for children.", "SwapFair ليست للأطفال.", "SwapFair बच्चों के लिए नहीं है।")],
            [L("Public meetups", "لقاءات عامة", "सार्वजनिक मुलाकात"), L("Home addresses stay private until you choose otherwise, and the default is never.", "عناوين المنازل تبقى خاصة، والافتراضي ألا تُشارك.", "घर के पते निजी रहते हैं। डिफ़ॉल्ट यह है कि वे साझा नहीं होते।")],
            [L("Blocked before publish", "يُمنع قبل النشر", "प्रकाशित होने से पहले रुके"), L("Prohibited items cannot be offered or requested, including in a counteroffer.", "لا يمكن عرض الأغراض الممنوعة ولا طلبها، حتى في العرض المقابل.", "प्रतिबंधित वस्तुएँ न दी जा सकती हैं न माँगी, प्रतिप्रस्ताव में भी नहीं।")],
          ].map((pair) => {
            const title = pair[0];
            const body = pair[1];
            if (!title || !body) return null;
            return (
              <div key={title.en} className="stack">
                <strong>{app.t(title)}</strong>
                <p className="muted">{app.t(body)}</p>
              </div>
            );
          })}
        </div>
        <div className="row wrap">
          <button className="btn btn-secondary btn-small" onClick={() => app.go("safety")}>{app.t(L("Safety Center", "مركز السلامة", "सुरक्षा केंद्र"))}</button>
          <button className="btn btn-secondary btn-small" onClick={() => app.go("policy")}>{app.t(L("Prohibited listings policy", "سياسة الإعلانات الممنوعة", "प्रतिबंधित लिस्टिंग नीति"))}</button>
        </div>
      </section>
      <section className="stack">
        <h2>{app.t(L("Two countries, one way of trading", "بلدان، وطريقة واحدة للمقايضة", "दो देश, सौदा करने का एक तरीका"))}</h2>
        <p className="muted">{app.t(L("Cross-border UAE–India trades are off in this version.", "صفقات الإمارات مع الهند متوقفة في هذه النسخة.", "इस संस्करण में यूएई–भारत के सीमा-पार सौदे बंद हैं।"))}</p>
        <div className="cityrow">
          {["Dubai", "Abu Dhabi", "Sharjah", "Bengaluru", "Mumbai", "Delhi", "Jaipur", "Kochi"].map((city) => <span key={city} className="pill">{city}</span>)}
        </div>
      </section>
      <footer className="muted small spread wrap">
        <span>© 2026 SwapFair</span>
        <span className="num">{money(900, "AED", app.locale)} · {money(62000, "INR", app.locale)}</span>
      </footer>
    </div>
  );
}

export function Auth() {
  const app = useApp();
  const signup = app.story.authMode === "signup";
  const [name, setName] = useState(signup ? "Layla Al Mazrouei" : "");
  const [email, setEmail] = useState("layla@example.com");
  const [phone, setPhone] = useState("+971 50 412 8831");
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState("");
  const submit = () => {
    if (signup && name.trim().length < 3) return setError(app.t(L("Add the name you want neighbours to see.", "أضف الاسم الذي تود أن يراه الناس.", "वह नाम लिखें जो पड़ोसी देखें।")));
    if (!email.includes("@")) return setError(app.t(L("Enter a real email address.", "أدخل بريدًا صحيحًا.", "सही ईमेल लिखें।")));
    if (signup && phone.replace(/\D/g, "").length < 8) return setError(app.t(L("Enter a mobile number.", "أدخل رقم هاتف.", "मोबाइल नंबर लिखें।")));
    if (signup && !adult) return setError(app.t(L("You need to be 18 or older.", "يجب أن يكون عمرك 18 عامًا أو أكثر.", "आपकी उम्र 18 वर्ष या अधिक होनी चाहिए।")));
    setError("");
    if (signup) {
      app.patch({ phase: "onboarding" });
      app.go("country");
    } else {
      app.patch({ phase: app.story.phase === "guest" ? "listed" : app.story.phase });
      app.go("home");
    }
  };
  return (
    <div className="page narrow stack">
      <button className="btn btn-ghost" onClick={() => app.go("landing")}><Icon name="back" /> {app.t(L("Back", "رجوع", "वापस"))}</button>
      <h1>{signup ? app.t(L("Create your SwapFair account", "أنشئ حسابك في SwapFair", "अपना SwapFair खाता बनाएँ")) : app.t(L("Welcome back", "مرحبًا بعودتك", "वापसी पर स्वागत है"))}</h1>
      <div className="seg">
        <button type="button" aria-pressed={signup} onClick={() => app.patch({ authMode: "signup" })}>{app.t(L("Create account", "حساب جديد", "खाता बनाएँ"))}</button>
        <button type="button" aria-pressed={!signup} onClick={() => app.patch({ authMode: "signin" })}>{app.t(L("Sign in", "دخول", "साइन इन"))}</button>
      </div>
      {signup ? <label className="field"><span>{app.t(L("Name", "الاسم", "नाम"))}</span><input value={name} onChange={(e) => setName(e.target.value)} /></label> : null}
      <label className="field"><span>{app.t(L("Email", "البريد", "ईमेल"))}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      {signup ? <label className="field"><span>{app.t(L("Mobile", "الهاتف", "मोबाइल"))}</span><input className="num" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label> : null}
      <label className="field"><span>{app.t(L("Password", "كلمة المرور", "पासवर्ड"))}</span><input type="password" defaultValue="prototype" autoComplete="current-password" /></label>
      {signup ? (
        <label className="check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>{app.t(L("I am 18 or older. SwapFair is not for children.", "عمري 18 عامًا أو أكثر. SwapFair ليست للأطفال.", "मैं 18 वर्ष या अधिक का हूँ। SwapFair बच्चों के लिए नहीं है।"))}</span>
        </label>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button className="btn btn-primary" onClick={submit}>{signup ? app.t(L("Continue", "متابعة", "आगे बढ़ें")) : app.t(L("Sign in", "دخول", "साइन इन"))}</button>
      <p className="muted small">{app.t(L("You will accept the Terms, Privacy Policy, and Prohibited Listings Policy before you finish.", "ستقبل الشروط وسياسة الخصوصية وسياسة الإعلانات الممنوعة قبل الإنهاء.", "समाप्त करने से पहले आप शर्तें, गोपनीयता नीति और प्रतिबंधित लिस्टिंग नीति स्वीकार करेंगे।"))}</p>
    </div>
  );
}

export function Country() {
  const app = useApp();
  const [picked, setPicked] = useState<"AE" | "IN">(app.country);
  const [city, setCity] = useState(picked === "AE" ? "Dubai" : "Bengaluru");
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Where do you trade?", "أين تقايض؟", "आप कहाँ सौदा करते हैं?"))}</h1>
      <p className="lead">{app.t(L("Choose one country. Trades between the UAE and India are turned off in this version.", "اختر بلدًا واحدًا. صفقات الإمارات مع الهند متوقفة في هذه النسخة.", "एक देश चुनें। इस संस्करण में यूएई और भारत के बीच सौदे बंद हैं।"))}</p>
      <div className="grid-2">
        {(["AE", "IN"] as const).map((code) => (
          <label key={code} className={`choice ${picked === code ? "on" : ""}`}>
            <input type="radio" name="country" checked={picked === code} onChange={() => { setPicked(code); setCity(code === "AE" ? "Dubai" : "Bengaluru"); }} />
            <span><strong>{code === "AE" ? "United Arab Emirates" : "India"}</strong><span className="muted" style={{ display: "block" }}>{code === "AE" ? "AED" : "INR"}</span></span>
          </label>
        ))}
      </div>
      <label className="field">
        <span>{app.t(L("City", "المدينة", "शहर"))}</span>
        <select value={city} onChange={(e) => setCity(e.target.value)}>
          {cities[picked].map((item) => <option key={item}>{item}</option>)}
        </select>
      </label>
      <button className="btn btn-primary" onClick={() => app.chooseMarket(picked, { city, area: picked === "AE" ? "Dubai Marina" : "Indiranagar", phase: "onboarding", onboardStep: 0 }, "onboarding")}>{app.t(L("Continue", "متابعة", "आगे बढ़ें"))}</button>
    </div>
  );
}

export function Onboarding() {
  const app = useApp();
  const step = app.story.onboardStep;
  const have = app.story.have;
  const want = app.story.want;
  const toggle = (key: "have" | "want", id: typeof have[number]) => {
    const list = app.story[key];
    app.patch({ [key]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] });
  };
  return (
    <div className="page narrow stack">
      <p className="kicker">{app.t(L("Step {n} of 4", "الخطوة {n} من 4", "चरण {n} / 4"), { n: step + 1 })}</p>
      <div className="stepper" aria-hidden="true">{[0, 1, 2, 3].map((n) => <span key={n} className={n <= step ? "on" : ""}>{n + 1}</span>)}</div>
      {step === 0 ? (
        <>
          <h1>{app.t(L("How far will you travel?", "إلى أي مدى تنتقل؟", "आप कितनी दूर जाएँगे?"))}</h1>
          <p className="muted">{app.story.city} · {app.story.area}</p>
          <div className="row wrap">
            {[5, 15, 30, 50].map((km) => (
              <button key={km} className={`chip ${app.story.radius === km ? "on" : ""}`} onClick={() => app.patch({ radius: km })}>{km} km</button>
            ))}
          </div>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <h1>{app.t(L("What do you have, and what do you want?", "ماذا لديك، وماذا تريد؟", "आपके पास क्या है, और क्या चाहिए?"))}</h1>
          <p>{app.t(L("I have", "لدي", "मेरे पास है"))}</p>
          <div className="row wrap">{categories.map((category) => <button key={category.id} className={`chip ${have.includes(category.id) ? "on" : ""}`} onClick={() => toggle("have", category.id)}>{app.t(category.label)}</button>)}</div>
          <p>{app.t(L("I want", "أريد", "मुझे चाहिए"))}</p>
          <div className="row wrap">{categories.map((category) => <button key={category.id} className={`chip ${want.includes(category.id) ? "on" : ""}`} onClick={() => toggle("want", category.id)}>{app.t(category.label)}</button>)}</div>
          {have.length === 0 || want.length === 0 ? <p className="error">{app.t(L("Choose at least one category you have and one you want.", "اختر فئة واحدة على الأقل لديك وواحدة تريدها.", "कम से कम एक श्रेणी चुनें जो आपके पास है और एक जो आपको चाहिए।"))}</p> : null}
        </>
      ) : null}
      {step === 2 ? (
        <>
          <h1>{app.t(L("Verify a way to reach you", "وثّق وسيلة للتواصل", "संपर्क का एक तरीका सत्यापित करें"))}</h1>
          <p className="muted">{app.t(L("Email or mobile is required. Identity can wait.", "البريد أو الهاتف مطلوب. الهوية يمكن أن تنتظر.", "ईमेल या मोबाइल ज़रूरी है। पहचान रुक सकती है।"))}</p>
          <button className="btn btn-secondary" onClick={() => app.go("verify")}>{app.t(L("Verify now", "وثّق الآن", "अभी सत्यापित करें"))}</button>
        </>
      ) : null}
      {step === 3 ? (
        <>
          <h1>{app.t(L("Agree before you list", "وافق قبل أن تُدرج", "लिस्ट करने से पहले सहमति"))}</h1>
          <label className="check"><input type="checkbox" defaultChecked /><span>{app.t(L("I accept the Terms, the Privacy Policy, and the Prohibited Listings Policy.", "أقبل الشروط وسياسة الخصوصية وسياسة الإعلانات الممنوعة.", "मैं शर्तें, गोपनीयता नीति और प्रतिबंधित लिस्टिंग नीति स्वीकार करता हूँ।"))}</span></label>
          <button className="btn btn-ghost" onClick={() => app.go("policy")}>{app.t(L("Read the prohibited listings policy", "اقرأ سياسة الإعلانات الممنوعة", "प्रतिबंधित लिस्टिंग नीति पढ़ें"))}</button>
          <article className="card pad stack">
            <h2>{app.t(L("Optional, whenever you like", "اختياري، وقتما شئت", "वैकल्पिक, जब चाहें"))}</h2>
            <p className="muted">{app.t(L("Photo, short bio, identity check, delivery preferences, languages.", "صورة ونبذة وتوثيق هوية وتفضيلات التوصيل واللغات.", "फ़ोटो, संक्षिप्त परिचय, पहचान जाँच, डिलीवरी पसंद, भाषाएँ।"))}</p>
            <button className="btn btn-secondary" onClick={() => app.go("identity")}>{app.t(L("Identity check", "توثيق الهوية", "पहचान जाँच"))}</button>
          </article>
        </>
      ) : null}
      <div className="row wrap">
        {step > 0 ? <button className="btn btn-secondary" onClick={() => app.patch({ onboardStep: step - 1 })}>{app.t(L("Back", "رجوع", "वापस"))}</button> : null}
        <button className="btn btn-primary" onClick={() => {
          if (step === 1 && (have.length === 0 || want.length === 0)) return;
          if (step < 3) app.patch({ onboardStep: step + 1 });
          else { app.patch({ phase: "verified" }); app.go("home"); }
        }}>{step === 3 ? app.t(L("Finish", "إنهاء", "समाप्त")) : app.t(L("Continue", "متابعة", "आगे बढ़ें"))}</button>
        {step === 3 ? <button className="btn btn-ghost" onClick={() => { app.patch({ phase: "verified" }); app.go("home"); }}>{app.t(L("Skip optional steps", "تخطَّ الخطوات الاختيارية", "वैकल्पिक चरण छोड़ें"))}</button> : null}
      </div>
    </div>
  );
}

export function Verify() {
  const app = useApp();
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [code, setCode] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="page narrow stack">
      <button className="btn btn-ghost" onClick={app.back}><Icon name="back" /> {app.t(L("Back", "رجوع", "वापस"))}</button>
      <h1>{app.t(L("Verify email or mobile", "وثّق البريد أو الهاتف", "ईमेल या मोबाइल सत्यापित करें"))}</h1>
      <div className="seg">
        <button type="button" aria-pressed={channel === "sms"} onClick={() => setChannel("sms")}>{app.t(L("Mobile", "الهاتف", "मोबाइल"))}</button>
        <button type="button" aria-pressed={channel === "email"} onClick={() => setChannel("email")}>{app.t(L("Email", "البريد", "ईमेल"))}</button>
      </div>
      <p className="muted">{channel === "sms" ? "+971 50 412 8831" : "layla@example.com"}</p>
      <label className="field"><span>{app.t(L("Code", "الرمز", "कोड"))}</span><input className="num" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" /></label>
      <p className="small muted">{app.t(L("Prototype code: 482913", "رمز النموذج: 482913", "प्रोटोटाइप कोड: 482913"))}</p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {done ? <p className="notice good">{app.t(L("Verified. Other people will see a phone or email badge, not the number or address.", "تم التوثيق. سيرى الآخرون شارة الهاتف أو البريد، لا الرقم ولا العنوان.", "सत्यापित। दूसरे लोग बैज देखेंगे, नंबर या पता नहीं।"))}</p> : null}
      <button className="btn btn-primary" onClick={() => {
        if (code.trim() !== "482913") { setError(app.t(L("That code does not match.", "الرمز غير مطابق.", "कोड मेल नहीं खाता।"))); return; }
        setError(""); setDone(true); app.notify(app.t(L("Contact verified", "تم توثيق التواصل", "संपर्क सत्यापित")));
      }}>{app.t(L("Confirm code", "تأكيد الرمز", "कोड की पुष्टि करें"))}</button>
      <button className="btn btn-secondary" onClick={() => app.go("identity")}>{app.t(L("Identity check is optional", "توثيق الهوية اختياري", "पहचान जाँच वैकल्पिक है"))}</button>
    </div>
  );
}

export function Identity() {
  const app = useApp();
  const [pending, setPending] = useState(false);
  return (
    <div className="page narrow stack">
      <button className="btn btn-ghost" onClick={() => app.go("profile")}><Icon name="back" /> {app.t(L("Back", "رجوع", "वापस"))}</button>
      <h1>{app.t(L("Identity check", "توثيق الهوية", "पहचान जाँच"))}</h1>
      <p className="lead">{app.t(L("Optional. In the UAE this would use Emirates ID. In India, Aadhaar. This prototype does not collect a real document.", "اختياري. في الإمارات يُستخدم الهوية الإماراتية، وفي الهند آدهار. هذا النموذج لا يجمع وثيقة حقيقية.", "वैकल्पिक। यूएई में एमिरेट्स आईडी, भारत में आधार। यह प्रोटोटाइप असली दस्तावेज़ नहीं लेता।"))}</p>
      <div className="grid-2">
        <article className="card pad stack"><h2>{app.t(L("What it means", "ماذا يعني", "इसका मतलब"))}</h2><p>{app.t(L("The name on the account matches a government ID. Other people see a badge, never the document.", "الاسم في الحساب يطابق هوية حكومية. يرى الآخرون شارة لا الوثيقة.", "खाते का नाम सरकारी पहचान से मेल खाता है। दूसरे लोग बैज देखते हैं, दस्तावेज़ नहीं।"))}</p></article>
        <article className="card pad stack"><h2>{app.t(L("What it does not mean", "ماذا لا يعني", "इसका मतलब नहीं"))}</h2><p>{app.t(L("It does not prove an item is genuine, fairly estimated, or safe to meet for.", "لا يثبت أن الغرض أصلي أو أن تقديره عادل أو أن اللقاء آمن.", "यह साबित नहीं करता कि वस्तु असली है, अनुमान उचित है, या मिलना सुरक्षित है।"))}</p></article>
      </div>
      {pending ? <NoticePending app={app} /> : <button className="btn btn-primary" onClick={() => setPending(true)}>{app.t(L("Start verification", "ابدأ التوثيق", "सत्यापन शुरू करें"))}</button>}
    </div>
  );
}

function NoticePending({ app }: { app: ReturnType<typeof useApp> }) {
  return <p className="notice warn">{app.t(L("Verification is pending. Most checks finish the same day. We will notify you. Your ID is not shown on your profile.", "التوثيق قيد الانتظار. تنتهي معظم عمليات التحقق في اليوم نفسه. سنبلغك. لن تظهر هويتك في ملفك.", "सत्यापन लंबित है। ज़्यादातर जाँचें उसी दिन पूरी होती हैं। हम बताएँगे। आपकी पहचान प्रोफ़ाइल पर नहीं दिखेगी।"))}</p>;
}
