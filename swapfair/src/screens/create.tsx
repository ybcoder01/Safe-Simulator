import { L } from "../copy";
import { categories } from "../data";
import { money, scanPolicy } from "../logic";
import { useApp } from "../state";
import type { CategoryId, Rank } from "../types";
import { Art, Disclaimer, Notice, PolicyNotice } from "../ui";
import { Icon } from "../icons";

const steps = [
  L("Offer", "العرض", "प्रस्ताव"),
  L("Photos", "الصور", "फ़ोटो"),
  L("Details", "التفاصيل", "विवरण"),
  L("Value", "القيمة", "मूल्य"),
  L("In return", "في المقابل", "बदले में"),
  L("Exchange", "التبادل", "अदला-बदली"),
  L("Policy", "السياسة", "नीति"),
  L("Preview", "معاينة", "झलक"),
];

export function Create() {
  const app = useApp();
  const draft = app.story.create;
  const set = (partial: Partial<typeof draft>) => app.updateCreate(partial);
  const currency = app.country === "AE" ? "AED" : "INR";
  const text = `${draft.title} ${draft.description} ${draft.specific} ${draft.wishes.map((wish) => wish.text).join(" ")}`;
  const next = () => {
    if (draft.step === 2 && draft.kind === "item" && draft.photos < 1) return;
    if (draft.step === 2 && draft.stockBlocked) return;
    if (draft.step === 3 && (!draft.title.trim() || !draft.owned)) return;
    if (draft.step === 4 && (!draft.value || !draft.ackValue)) return;
    if (draft.step === 6) {
      const hit = scanPolicy(text);
      set({ outcome: hit.outcome, step: 7 });
      return;
    }
    set({ step: Math.min(8, draft.step + 1) });
  };
  return (
    <div className="page narrow stack">
      <p className="kicker">{app.t(L("Create a listing", "إنشاء إعلان", "लिस्टिंग बनाएँ"))}</p>
      <div className="stepper" aria-label="progress">{steps.map((label, index) => <span key={label.en} className={index + 1 <= draft.step ? "on" : ""} title={app.t(label)}>{index + 1}</span>)}</div>
      <h1>{app.t(steps[draft.step - 1] ?? steps[0] ?? L("Listing", "إعلان", "लिस्टिंग"))}</h1>
      {draft.step === 1 ? (
        <div className="grid-2">
          <label className={`choice ${draft.kind === "item" ? "on" : ""}`}><input type="radio" name="kind" checked={draft.kind === "item"} onChange={() => set({ kind: "item" })} /><span><strong>{app.t(L("Item", "غرض", "वस्तु"))}</strong><span className="muted" style={{ display: "block" }}>{app.t(L("One physical thing. Bundles happen later, inside a proposal.", "غرض مادي واحد. الحزم تأتي لاحقًا داخل اقتراح.", "एक भौतिक चीज़। बंडल बाद में प्रस्ताव के अंदर बनते हैं।"))}</span></span></label>
          <label className={`choice ${draft.kind === "service" ? "on" : ""}`}><input type="radio" name="kind" checked={draft.kind === "service"} onChange={() => set({ kind: "service" })} /><span><strong>{app.t(L("Service", "خدمة", "सेवा"))}</strong><span className="muted" style={{ display: "block" }}>{app.t(L("A clearly bounded piece of work, like a two-hour session.", "عمل محدد بوضوح، مثل جلسة ساعتين.", "साफ़ सीमा वाला काम, जैसे दो घंटे का सत्र।"))}</span></span></label>
        </div>
      ) : null}
      {draft.step === 2 ? (
        <div className="stack">
          <p>{draft.kind === "item" ? app.t(L("At least one original photo. Show corners, wear, and anything missing.", "صورة أصلية واحدة على الأقل. أظهر الزوايا والاستعمال وما ينقص.", "कम से कम एक असली फ़ोटो। कोने, घिसाव और जो कमी हो उसे दिखाएँ।")) : app.t(L("A photo of previous work helps. It is encouraged, not required, for a service.", "صورة لعمل سابق مفيدة. هي مستحسنة لا إلزامية للخدمة.", "पिछले काम की फ़ोटो मदद करती है। सेवा के लिए यह सुझाव है, ज़रूरत नहीं।"))}</p>
          <div className="row wrap">
            {[1, 2, 3].map((n) => (
              <button key={n} className="card" style={{ width: 120, padding: 8 }} onClick={() => set({ photos: Math.max(draft.photos, n), stockBlocked: false })}>
                {n <= draft.photos ? <Art kind={draft.kind === "service" ? "service" : "ipad"} label="" /> : <span className="muted">{app.t(L("Add angle", "أضف زاوية", "कोण जोड़ें"))}</span>}
              </button>
            ))}
          </div>
          {app.story.scenario === "upload-failed" ? <Notice tone="bad" title={app.t(L("Upload failed", "فشل الرفع", "अपलोड विफल"))}>{app.t(L("The photo did not upload. Check the connection and try again. Nothing was published.", "لم تُرفع الصورة. تحقق من الاتصال وأعد المحاولة. لم يُنشر شيء.", "फ़ोटो अपलोड नहीं हुई। कनेक्शन जाँचें और फिर कोशिश करें। कुछ प्रकाशित नहीं हुआ।"))}</Notice> : null}
          <button className="btn btn-secondary" onClick={() => set({ stockBlocked: true })}>{app.t(L("This is a stock image", "هذه صورة جاهزة", "यह स्टॉक तस्वीर है"))}</button>
          {draft.stockBlocked ? <Notice tone="bad">{app.t(L("This looks like a stock or duplicate image. Listings need a photo of your actual item.", "تبدو هذه صورة جاهزة أو مكررة. يحتاج الإعلان إلى صورة لغرضك الحقيقي.", "यह स्टॉक या दोहराई तस्वीर लगती है। लिस्टिंग में आपकी असली वस्तु की फ़ोटो चाहिए।"))}</Notice> : null}
        </div>
      ) : null}
      {draft.step === 3 ? (
        <div className="stack">
          <label className="field"><span>{app.t(L("Category", "الفئة", "श्रेणी"))}</span>
            <select value={draft.category} onChange={(e) => set({ category: e.target.value as CategoryId })}>
              {categories.map((category) => <option key={category.id} value={category.id}>{app.t(category.label)}</option>)}
            </select>
          </label>
          <label className="field"><span>{app.t(L("Title", "العنوان", "शीर्षक"))}</span><input value={draft.title} onChange={(e) => set({ title: e.target.value })} /></label>
          <label className="field"><span>{app.t(L("Description", "الوصف", "विवरण"))}</span><textarea value={draft.description} onChange={(e) => set({ description: e.target.value })} /></label>
          {draft.kind === "item" ? <label className="field"><span>{app.t(L("Condition", "الحالة", "हालत"))}</span><input value={draft.condition} onChange={(e) => set({ condition: e.target.value })} /></label> : null}
          <label className="field"><span>{app.t(L("Brand, model, or what is included", "العلامة أو الطراز أو ما هو مشمول", "ब्रांड, मॉडल, या क्या शामिल है"))}</span><input value={draft.brand} onChange={(e) => set({ brand: e.target.value })} /></label>
          <label className="field"><span>{app.t(L("Age or purchase date", "العمر أو تاريخ الشراء", "उम्र या खरीद की तारीख"))}</span><input value={draft.age} onChange={(e) => set({ age: e.target.value })} /></label>
          <label className="field"><span>{app.t(L("Defects or missing parts", "العيوب أو الأجزاء الناقصة", "दोष या गायब हिस्से"))}</span><input value={draft.defects} onChange={(e) => set({ defects: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={draft.owned} onChange={(e) => set({ owned: e.target.checked })} /><span>{app.t(L("I am allowed to offer this, and it is not stolen or counterfeit.", "يحق لي عرض هذا، وهو ليس مسروقًا ولا مقلدًا.", "मुझे इसे देने का अधिकार है, और यह न चोरी का है न नकली।"))}</span></label>
          <div className="row wrap">
            <button className="btn btn-secondary btn-small" onClick={() => set({ title: "Augmentin 625 antibiotic strips", description: "Unopened prescription antibiotic.", category: "home" })}>{app.t(L("Try a prohibited example", "جرّب مثالًا ممنوعًا", "प्रतिबंधित उदाहरण आज़माएँ"))}</button>
            <button className="btn btn-secondary btn-small" onClick={() => set({ title: "Omron blood pressure monitor", description: "Used home medical device. It powers on.", category: "home" })}>{app.t(L("Try a review example", "جرّب مثال مراجعة", "समीक्षा का उदाहरण आज़माएँ"))}</button>
          </div>
        </div>
      ) : null}
      {draft.step === 4 ? (
        <div className="stack">
          <label className="field"><span>{app.t(L("Your estimate", "تقديرك", "आपका अनुमान"))} ({currency})</span><input className="num" inputMode="numeric" value={draft.value} onChange={(e) => set({ value: e.target.value.replace(/[^\d]/g, "") })} /></label>
          <div className="seg">
            <button type="button" aria-pressed={draft.negotiable} onClick={() => set({ negotiable: true })}>{app.t(L("Negotiable", "قابل للتفاوض", "मोलभाव संभव"))}</button>
            <button type="button" aria-pressed={!draft.negotiable} onClick={() => set({ negotiable: false })}>{app.t(L("Fixed estimate", "تقدير ثابت", "निश्चित अनुमान"))}</button>
          </div>
          <Notice>{app.t(L("Optional guidance: similar items nearby are only a hint. SwapFair will not show your number as a market price.", "إرشاد اختياري: الأغراض المشابهة القريبة مجرد تلميح. لن تعرض SwapFair رقمك كسعر سوق.", "वैकल्पिक संकेत: पास की मिलती वस्तुएँ सिर्फ़ संकेत हैं। SwapFair आपकी संख्या को बाज़ार भाव नहीं दिखाएगा।"))}</Notice>
          <label className="check"><input type="checkbox" checked={draft.ackValue} onChange={(e) => set({ ackValue: e.target.checked })} /><span>{app.t(L("I understand this number is my estimate, not a market price.", "أفهم أن هذا الرقم تقديري وليس سعر السوق.", "मैं समझता हूँ कि यह संख्या मेरा अनुमान है, बाज़ार भाव नहीं।"))}</span></label>
        </div>
      ) : null}
      {draft.step === 5 ? (
        <div className="stack">
          <p>{app.t(L("Rank what you would accept. A wish is not a listing, but it is still checked against the prohibited list.", "رتّب ما تقبل. الرغبة ليست إعلانًا، لكنها تُفحص أيضًا وفق قائمة الممنوعات.", "जो आप स्वीकार करेंगे उसे क्रम दें। चाहत लिस्टिंग नहीं है, फिर भी वह प्रतिबंधित सूची से जाँची जाती है।"))}</p>
          <label className="field"><span>{app.t(L("A specific item", "غرض محدد", "एक खास वस्तु"))}</span><input value={draft.specific} onChange={(e) => set({ specific: e.target.value })} /></label>
          {draft.wishes.map((wish, index) => (
            <div key={index} className="card pad stack">
              <input value={wish.text} onChange={(e) => {
                const wishes = draft.wishes.map((item, i) => i === index ? { ...item, text: e.target.value } : item);
                set({ wishes });
              }} />
              <div className="row wrap">
                {(["preferred", "consider", "no"] as Rank[]).map((rank) => (
                  <button key={rank} className={`chip ${wish.rank === rank ? "on" : ""}`} onClick={() => set({ wishes: draft.wishes.map((item, i) => i === index ? { ...item, rank } : item) })}>
                    {rank === "preferred" ? app.t(L("Preferred", "مفضّل", "पसंदीदा")) : rank === "consider" ? app.t(L("Would consider", "يمكن أن أقبل", "सोच सकता हूँ")) : app.t(L("Not interested", "غير مهتم", "रुचि नहीं"))}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <label className="check"><input type="checkbox" checked={draft.cashOk} onChange={(e) => set({ cashOk: e.target.checked })} /><span>{app.t(L("I will accept a cash adjustment", "أقبل تعديلًا نقديًا", "मैं नकद समायोजन स्वीकार करूँगा"))}</span></label>
          <label className="check"><input type="checkbox" checked={draft.bundlesOk} onChange={(e) => set({ bundlesOk: e.target.checked })} /><span>{app.t(L("I will accept multiple items in one proposal", "أقبل عدة أغراض في اقتراح واحد", "मैं एक प्रस्ताव में कई वस्तुएँ स्वीकार करूँगा"))}</span></label>
          <label className="check"><input type="checkbox" checked={draft.open} onChange={(e) => set({ open: e.target.checked })} /><span>{app.t(L("Open to offers", "منفتح على العروض", "ऑफ़र के लिए खुला"))}</span></label>
        </div>
      ) : null}
      {draft.step === 6 ? (
        <div className="stack">
          {([
            ["meetup", L("Public meetup", "لقاء عام", "सार्वजनिक मुलाकात")],
            ["pickup", L("Pickup", "استلام", "पिकअप")],
            ["delivery", L("Delivery", "توصيل", "डिलीवरी")],
            ["shipping", L("Shipping", "شحن", "शिपिंग")],
          ] as const).map(([key, label]) => (
            <label key={key} className="check"><input type="checkbox" checked={draft[key]} onChange={(e) => set({ [key]: e.target.checked })} /><span>{app.t(label)}</span></label>
          ))}
          {draft.shipping ? <Notice tone="warn">{app.t(L("You must agree who pays before anything ships. SwapFair does not guarantee delivery. Do not ship prohibited or hazardous goods. Cross-border UAE–India shipping is off.", "يجب الاتفاق على من يدفع قبل الشحن. SwapFair لا تضمن التوصيل. لا تشحن أغراضًا ممنوعة أو خطرة. الشحن بين الإمارات والهند متوقف.", "भेजने से पहले तय करें कौन भुगतान करेगा। SwapFair डिलीवरी की गारंटी नहीं देता। प्रतिबंधित या खतरनाक सामान न भेजें। यूएई–भारत शिपिंग बंद है।"))}</Notice> : null}
          <label className="field"><span>{app.t(L("Trade radius (km)", "نطاق الصفقة (كم)", "सौदे का दायरा (किमी)"))}</span><input type="number" value={draft.radius} onChange={(e) => set({ radius: Number(e.target.value) })} /></label>
          <label className="field"><span>{app.t(L("Availability", "التوفر", "उपलब्धता"))}</span><input value={draft.availability} onChange={(e) => set({ availability: e.target.value })} /></label>
        </div>
      ) : null}
      {draft.step === 7 ? <PolicyStep /> : null}
      {draft.step === 8 ? (
        <article className="card pad stack">
          <Art kind={draft.kind === "service" ? "service" : "ipad"} label={draft.title} />
          <h2>{draft.title}</h2>
          <p className="amount num">{money(Number(draft.value || 0), currency, app.locale)}</p>
          <Disclaimer />
          <p>{draft.description}</p>
          <p className="muted">{draft.condition} · {app.story.area}</p>
          <p>{draft.wishes.filter((wish) => wish.rank !== "no").map((wish) => wish.text).join(" · ")}</p>
          <p className="small muted">{app.t(L("This is what other people will see.", "هذا ما سيراه الآخرون.", "यह दूसरे लोग देखेंगे।"))}</p>
        </article>
      ) : null}
      <div className="row wrap">
        {draft.step > 1 ? <button className="btn btn-secondary" onClick={() => set({ step: draft.step - 1 })}><Icon name="back" /> {app.t(L("Back", "رجوع", "वापस"))}</button> : null}
        {draft.step < 8 ? <button className="btn btn-primary" onClick={next} disabled={(draft.step === 4 && !draft.ackValue) || (draft.step === 3 && !draft.owned) || (draft.step === 2 && draft.stockBlocked)}>{app.t(L("Continue", "متابعة", "आगे बढ़ें"))}</button> : (
          <button className="btn btn-primary" onClick={app.publishListing} disabled={draft.outcome === "prohibited"}>{app.t(L("Publish listing", "نشر الإعلان", "लिस्टिंग प्रकाशित करें"))}</button>
        )}
      </div>
    </div>
  );
}

function PolicyStep() {
  const app = useApp();
  const draft = app.story.create;
  const hit = scanPolicy(`${draft.title} ${draft.description} ${draft.specific} ${draft.wishes.map((wish) => wish.text).join(" ")}`);
  return (
    <div className="stack">
      {hit.outcome === "allowed" ? <Notice tone="good" title={app.t(L("Allowed", "مسموح", "अनुमति है"))}>{app.t(L("Nothing in the title, description, wishes, or category needs a block. You can preview and publish.", "لا شيء في العنوان أو الوصف أو الرغبات أو الفئة يستدعي المنع. يمكنك المعاينة والنشر.", "शीर्षक, विवरण, चाहत या श्रेणी में कुछ भी रोकने योग्य नहीं है। आप झलक देखकर प्रकाशित कर सकते हैं।"))}</Notice> : null}
      {hit.outcome === "review" ? <Notice tone="warn" title={app.t(L("Needs review", "يحتاج مراجعة", "समीक्षा चाहिए"))}>{hit.message ? app.t(hit.message) : null}</Notice> : null}
      {hit.outcome === "prohibited" ? (
        <Notice tone="bad" title={hit.category ? app.t(hit.category) : app.t(L("Prohibited", "ممنوع", "प्रतिबंधित"))}>
          {hit.message ? app.t(hit.message) : null}
        </Notice>
      ) : null}
      {hit.outcome === "prohibited" ? (
        <div className="row wrap">
          <button className="btn btn-secondary" onClick={() => app.updateCreate({ step: 3 })}>{app.t(L("Edit the item", "عدّل الغرض", "वस्तु बदलें"))}</button>
          <button className="btn btn-ghost" onClick={() => app.go("policy")}>{app.t(L("Read the policy", "اقرأ السياسة", "नीति पढ़ें"))}</button>
          <button className="btn btn-ghost" onClick={() => app.notify(app.t(L("Appeal noted. A person will reply. Publishing stays blocked.", "سُجّل الاعتراض. سيرد شخص. النشر يبقى موقوفًا.", "अपील दर्ज हुई। कोई व्यक्ति जवाब देगा। प्रकाशन रुका रहेगा।")))}>{app.t(L("Appeal", "اعتراض", "अपील"))}</button>
        </div>
      ) : null}
      <PolicyNotice />
    </div>
  );
}

export function Manage() {
  const app = useApp();
  const currency = app.country === "AE" ? "AED" : "INR";
  const review = app.story.scenario === "under-review" || app.story.create.outcome === "review";
  const rejected = app.story.scenario === "rejected";
  const live = app.story.phase !== "guest" && app.story.phase !== "onboarding" && app.story.phase !== "verified" && !review && !rejected && !app.story.paused;
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Your listing", "إعلانك", "आपकी लिस्टिंग"))}</h1>
      {!live && !review && !rejected ? <Notice tone="info">{app.t(L("You have not published yet.", "لم تنشر بعد.", "आपने अभी प्रकाशित नहीं किया।"))}</Notice> : null}
      {review ? <Notice tone="warn" title={app.t(L("Pending review", "قيد المراجعة", "समीक्षा लंबित"))}>{app.t(L("We saved the listing. It is not public. Most reviews finish within a day. We will notify you. This is not an accusation.", "حفظنا الإعلان. إنه ليس عامًا. تنتهي معظم المراجعات خلال يوم. سنبلغك. هذا ليس اتهامًا.", "हमने लिस्टिंग सहेज ली। यह सार्वजनिक नहीं है। ज़्यादातर समीक्षाएँ एक दिन में पूरी होती हैं। हम बताएँगे। यह आरोप नहीं है।"))}</Notice> : null}
      {rejected ? (
        <Notice tone="bad" title={app.t(L("Not published", "لم يُنشر", "प्रकाशित नहीं"))}>
          {app.t(L("Medicines and prescription products cannot be offered or requested. You can change the listing or appeal.", "لا يمكن عرض الأدوية والمنتجات التي تحتاج وصفة ولا طلبها. يمكنك تعديل الإعلان أو الاعتراض.", "दवाएँ और नुस्खे वाले उत्पाद न दिए जा सकते हैं न माँगे। आप लिस्टिंग बदल सकते हैं या अपील कर सकते हैं।"))}
        </Notice>
      ) : null}
      <article className="card pad stack">
        <h2>{app.story.create.title}</h2>
        <p className="num">{money(Number(app.story.create.value || 0), currency, app.locale)}</p>
        <p>{app.story.create.description}</p>
        <div className="row wrap">
          {live ? <span className="pill good">{app.t(L("Active", "نشط", "सक्रिय"))}</span> : null}
          {app.story.paused ? <span className="pill warn">{app.t(L("Paused", "متوقف", "रुका हुआ"))}</span> : null}
          {review ? <span className="pill warn">{app.t(L("Under review", "قيد المراجعة", "समीक्षा में"))}</span> : null}
          {rejected ? <span className="pill bad">{app.t(L("Rejected", "مرفوض", "अस्वीकृत"))}</span> : null}
        </div>
        <Disclaimer />
      </article>
      <div className="row wrap">
        <button className="btn btn-secondary" onClick={() => { app.updateCreate({ step: 3, editing: true }); app.go("create"); }}>{app.t(L("Edit", "تعديل", "संपादित करें"))}</button>
        <button className="btn btn-secondary" onClick={() => app.patch({ paused: !app.story.paused })}>{app.story.paused ? app.t(L("Resume", "استئناف", "फिर शुरू")) : app.t(L("Pause", "إيقاف", "रोकें"))}</button>
        {rejected ? <button className="btn btn-ghost" onClick={() => app.notify(app.t(L("Appeal SF-22018 opened", "فُتح الاعتراض SF-22018", "अपील SF-22018 खुली")))}>{app.t(L("Appeal", "اعتراض", "अपील"))}</button> : null}
        <button className="btn btn-primary" onClick={() => { app.openListing(app.country === "AE" ? "ipad" : "sony"); }}>{app.t(L("Preview as others see it", "عاين كما يراه الآخرون", "जैसा दूसरे देखें"))}</button>
      </div>
      <PolicyNotice />
    </div>
  );
}
