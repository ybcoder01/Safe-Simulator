import { L } from "../copy";
import { useApp } from "../state";
import { listings } from "../data";
import { BalanceBar, ListingCard } from "../ui";

export function Design() {
  const app = useApp();
  const sample = listings.find((listing) => listing.id === "camera");
  return (
    <div className="page stack-lg" dir="ltr" lang="en">
      <p className="kicker">Design specification</p>
      <h1>SwapFair, written down</h1>
      <p className="lead">This screen is the English design record. The product around it is localized, including Arabic right-to-left.</p>
      <section className="stack">
        <h2>Principles</h2>
        <div className="grid-2">
          {[
            ["Show the difference", "People should see both sides, the cash adjustment, and the gap without interpreting a score."],
            ["Estimates stay estimates", "A number on a listing is the owner’s estimate. It is never styled as a quote or a guarantee."],
            ["One agreement, one place", "Chat can clarify. Only a proposal version can change items, values, or cash."],
            ["Safety is specific", "Public places, private addresses, and plain warnings. No fake escrow."],
            ["Moderation explains itself", "Allowed, needs review, or prohibited. A signal is never the whole reason."],
            ["Calm, not clever", "Warm paper, one clay color, green only when something is confirmed."],
          ].map(([title, body]) => <article key={title} className="card pad stack"><h3>{title}</h3><p className="muted">{body}</p></article>)}
        </div>
      </section>
      <section className="stack">
        <h2>Personas</h2>
        <div className="grid-2">
          <article className="card pad"><h3>Layla Al Mazrouei</h3><p>Dubai Marina, 29, designer. Trades an iPad for a camera. Needs the gap to be obvious and the meetup to stay public.</p></article>
          <article className="card pad"><h3>Rohan Iyer</h3><p>Business Bay, 33, photographer. Counters with a strap and a different cash adjustment. Cares that version 1 is not edited in place.</p></article>
          <article className="card pad"><h3>Priya Sharma</h3><p>Indiranagar, 27. First serious barter. Hindi and English, INR, and a large laptop-versus-camera gap.</p></article>
          <article className="card pad"><h3>Huda Al Suwaidi</h3><p>Moderator in Abu Dhabi. Needs the policy quote, the offered and requested items, and an audit trail. Not a risk score.</p></article>
        </div>
      </section>
      <section className="stack">
        <h2>Journeys</h2>
        <p>Use “Next in story” in the prototype bar. It runs register → country → onboarding → verify → listing → wishes → match → listing → multi-item proposal → cash → send → counteroffer → compare → accept → meetup → check-in → confirm → review.</p>
        <p>Exception journeys cover a prohibited medicine listing, a prohibited counteroffer, a committed PlayStation, a significant difference, a counterfeit report, a cancelled meetup, and a dispute.</p>
      </section>
      <section className="stack">
        <h2>Sitemap and navigation</h2>
        <p>Mobile: Home, Discover, Create, Trades, Profile. Desktop adds Matches, Messages, Favorites, notifications, and search. Trades are not messages. Admin and this spec sit outside the consumer nav.</p>
      </section>
      <section className="stack">
        <h2>Tokens</h2>
        <div className="row wrap">
          {["--primary", "--bg", "--surface", "--ink", "--good", "--warn", "--bad"].map((token) => (
            <div key={token} className="card pad"><i style={{ display: "block", width: 72, height: 48, borderRadius: 12, background: `var(${token})`, border: "1px solid var(--line)" }} /><span className="small">{token}</span></div>
          ))}
        </div>
        <p className="muted">Type: Fraunces for titles, Outfit for UI. Arabic uses Noto Naskh and Noto Sans Arabic. Hindi uses Noto Sans Devanagari. Body is 17px.</p>
      </section>
      <section className="stack">
        <h2>Components</h2>
        <div className="row wrap">
          <button className="btn btn-primary">Primary</button>
          <button className="btn btn-secondary">Secondary</button>
          <span className="pill good">Balanced</span>
          <span className="pill warn">Small difference</span>
          <span className="pill bad">Prohibited</span>
        </div>
        <BalanceBar yours={1800} theirs={2100} currency="AED" />
        {sample ? <ListingCard listing={sample} /> : null}
      </section>
      <section className="grid-2">
        <article className="stack">
          <h2>Wireframe</h2>
          <div className="wire" aria-hidden="true"><i className="b" /><i /><i style={{ width: "70%" }} /><i className="b" /></div>
          <p className="small muted">Low-fidelity structure for home: greeting, search, match, nearby, safety note.</p>
        </article>
        <article className="stack">
          <h2>Accessibility and RTL</h2>
          <p>WCAG 2.2 AA targets: 17px body, 4.5:1 text, 44px targets, focus rings, labels on icon buttons, status not by color alone, live region on the balance, and reduced motion.</p>
          <p>Arabic sets dir=rtl on the document. Layout uses logical properties, so columns and the bottom nav mirror. Amounts and phone numbers stay left-to-right.</p>
        </article>
      </section>
      <p className="muted">{app.t(L("Open Safety Center and the policy from the product for the rules in the active language.", "افتح مركز السلامة والسياسة من المنتج للقواعد بلغة الواجهة.", "नियमों के लिए उत्पाद से सुरक्षा केंद्र और नीति खोलें।"))}</p>
    </div>
  );
}

export function States() {
  const app = useApp();
  const blocks = [
    [L("No listings nearby", "لا إعلانات قريبة", "पास में कोई लिस्टिंग नहीं"), L("Widen the radius.", "وسّع النطاق.", "दायरा बढ़ाएँ।")],
    [L("No matches yet", "لا مطابقات بعد", "अभी कोई मेल नहीं"), L("List something you have.", "أدرج ما لديك.", "जो आपके पास है उसे सूचीबद्ध करें।")],
    [L("No active items to offer", "لا أغراض نشطة للعرض", "देने के लिए कोई सक्रिय वस्तु नहीं"), L("Publish a listing or add an unlisted item.", "انشر إعلانًا أو أضف غرضًا غير منشور.", "लिस्टिंग प्रकाशित करें या असूचीबद्ध वस्तु जोड़ें।")],
    [L("No proposals", "لا اقتراحات", "कोई प्रस्ताव नहीं"), L("Trades will show up separate from messages.", "ستظهر الصفقات منفصلة عن الرسائل.", "सौदे संदेशों से अलग दिखेंगे।")],
    [L("No messages", "لا رسائل", "कोई संदेश नहीं"), L("Start from a listing.", "ابدأ من إعلان.", "लिस्टिंग से शुरू करें।")],
    [L("Listing under review", "الإعلان قيد المراجعة", "लिस्टिंग समीक्षा में"), L("Saved, not public, not an accusation.", "محفوظ وغير عام، وليس اتهامًا.", "सहेजा गया, सार्वजनिक नहीं, आरोप नहीं।")],
    [L("Listing rejected", "الإعلان مرفوض", "लिस्टिंग अस्वीकृत"), L("Name the policy and offer an edit or an appeal.", "اذكر السياسة واعرض التعديل أو الاعتراض.", "नीति बताएँ और बदलाव या अपील दें।")],
    [L("Offer expired", "انتهى العرض", "ऑफ़र समाप्त"), L("Send a new version if you still want the trade.", "أرسل نسخة جديدة إن بقيت راغبًا.", "अगर सौदा अभी भी चाहिए तो नया संस्करण भेजें।")],
    [L("Item already committed", "الغرض مرتبط بصفقة", "वस्तु पहले से प्रतिबद्ध"), L("It cannot enter a second accepted trade.", "لا يدخل صفقة مقبولة ثانية.", "यह दूसरे स्वीकृत सौदे में नहीं जा सकती।")],
    [L("Person unavailable", "الشخص غير متاح", "व्यक्ति उपलब्ध नहीं"), L("They paused proposals. You can still read the listing.", "أوقفوا الاقتراحات. يمكنك قراءة الإعلان.", "उन्होंने प्रस्ताव रोके हैं। लिस्टिंग पढ़ सकते हैं।")],
    [L("Network failure", "انقطع الاتصال", "नेटवर्क विफल"), L("Retry. Nothing was published.", "أعد المحاولة. لم يُنشر شيء.", "फिर कोशिश करें। कुछ प्रकाशित नहीं हुआ।")],
    [L("Upload failed", "فشل الرفع", "अपलोड विफल"), L("The photo did not upload.", "لم تُرفع الصورة.", "फ़ोटो अपलोड नहीं हुई।")],
    [L("Location denied", "رُفض الموقع", "स्थान अस्वीकृत"), L("Pick a city. We do not need a home address.", "اختر مدينة. لا نحتاج عنوان منزل.", "शहर चुनें। घर का पता नहीं चाहिए।")],
    [L("Verification pending", "التوثيق معلّق", "सत्यापन लंबित"), L("We will notify you. The document stays hidden.", "سنبلغك. تبقى الوثيقة مخفية.", "हम बताएँगे। दस्तावेज़ छिपा रहेगा।")],
    [L("Trade cancelled", "أُلغيت الصفقة", "सौदा रद्द"), L("Suggest another public time or close it.", "اقترح موعدًا عامًا آخر أو أغلقها.", "दूसरा सार्वजनिक समय सुझाएँ या बंद करें।")],
    [L("Account restricted", "الحساب مقيّد", "खाता प्रतिबंधित"), L("Reading stays open. New proposals do not.", "تبقى القراءة متاحة. الاقتراحات الجديدة لا.", "पढ़ना खुला रहता है। नए प्रस्ताव नहीं।")],
  ];
  return (
    <div className="page stack">
      <h1>{app.t(L("Empty, loading, error, and moderation states", "حالات الفراغ والتحميل والخطأ والإشراف", "खाली, लोडिंग, त्रुटि और मॉडरेशन अवस्थाएँ"))}</h1>
      <div className="grid-2">
        {blocks.map((pair) => {
          const title = pair[0];
          const body = pair[1];
          if (!title || !body) return null;
          return (
            <article key={title.en} className="card pad empty">
              <h3>{app.t(title)}</h3>
              <p className="muted">{app.t(body)}</p>
            </article>
          );
        })}
      </div>
      <div className="row wrap">
        <button className="btn btn-secondary" onClick={() => app.runException("network")}>{app.t(L("Preview network failure", "عاين انقطاع الاتصال", "नेटवर्क विफलता देखें"))}</button>
        <button className="btn btn-secondary" onClick={() => app.runException("under-review")}>{app.t(L("Preview review", "عاين المراجعة", "समीक्षा देखें"))}</button>
        <button className="btn btn-secondary" onClick={() => app.runException("rejected")}>{app.t(L("Preview rejection", "عاين الرفض", "अस्वीकृति देखें"))}</button>
      </div>
    </div>
  );
}
