import { L } from "../copy";
import { categories, listings, personById, wanted } from "../data";
import { explainMatch, greeting, money, passesQuery, phaseAtLeast } from "../logic";
import { useApp } from "../state";
import type { CategoryId, Handoff, Listing } from "../types";
import { Art, Disclaimer, EmptyState, ListingCard, Notice, PersonRow } from "../ui";
import { Icon } from "../icons";

export function Home() {
  const app = useApp();
  const me = personById(app.meId);
  const market = listings.filter((listing) => listing.country === app.country && !listing.unlisted && listing.ownerId !== app.meId);
  const nearby = market.filter((listing) => listing.city === app.story.city).slice(0, 4);
  const recommended = market
    .map((listing) => ({ listing, match: explainMatch(listing, app.story.have, app.story.want) }))
    .filter((item) => item.match.level === "strong" || item.match.level === "good")
    .slice(0, 3);
  const recent = app.story.recent.map((id) => listings.find((listing) => listing.id === id)).filter((item): item is Listing => Boolean(item));
  const fresh = phaseAtLeast(app.story.phase, "listed");
  if (app.loading) {
    return (
      <div className="page stack">
        <span className="skeleton" style={{ height: 36, width: "55%" }} />
        <span className="skeleton" style={{ height: 48 }} />
        <span className="skeleton" style={{ height: 180 }} />
        <span className="skeleton" style={{ height: 180 }} />
      </div>
    );
  }
  return (
    <div className="page stack-lg">
      {app.story.scenario === "restricted" ? <Notice tone="bad" title={app.t(L("Account restricted", "الحساب مقيّد", "खाता प्रतिबंधित"))}>{app.t(L("You can read messages, but you cannot publish or propose trades while a safety report is reviewed.", "يمكنك قراءة الرسائل، لكن لا يمكنك النشر أو اقتراح صفقات أثناء مراجعة بلاغ سلامة.", "आप संदेश पढ़ सकते हैं, पर सुरक्षा रिपोर्ट की समीक्षा तक लिस्टिंग या प्रस्ताव नहीं कर सकते।"))}</Notice> : null}
      {app.story.scenario === "network" ? <Notice tone="warn" title={app.t(L("You are offline", "أنت غير متصل", "आप ऑफ़लाइन हैं"))}><span>{app.t(L("Listings did not refresh.", "لم تتحدث الإعلانات.", "लिस्टिंग रिफ़्रेश नहीं हुईं।"))}</span><button className="btn btn-small" onClick={() => { app.patch({ scenario: null }); app.notify(app.t(L("You are back online", "عدت متصلًا", "आप फिर ऑनलाइन हैं"))); }}>{app.t(L("Retry", "إعادة المحاولة", "फिर कोशिश करें"))}</button></Notice> : null}
      {app.story.scenario === "location-denied" ? <Notice tone="warn" title={app.t(L("Location is off", "الموقع متوقف", "स्थान बंद है"))}>{app.t(L("Choose a city to see nearby trades. We never need your home address.", "اختر مدينة لرؤية الصفقات القريبة. لا نحتاج عنوان منزلك.", "पास के सौदे देखने के लिए शहर चुनें। हमें घर का पता नहीं चाहिए।"))}</Notice> : null}
      <header className="stack">
        <p className="kicker">{app.story.area} · {app.story.radius} km</p>
        <h1>{me ? greeting(app.country, app.locale, app.t(me.short)) : "SwapFair"}</h1>
        <label className="searchpill" style={{ maxWidth: "100%" }}>
          <Icon name="search" size={18} />
          <input placeholder={app.t(L("Search listings", "ابحث في الإعلانات", "लिस्टिंग खोजें"))} onFocus={() => app.go("search")} readOnly />
        </label>
        <button className="btn btn-primary" onClick={() => app.go("create")}>{app.t(L("What do you want to trade?", "ماذا تريد أن تقايض؟", "आप क्या बदलना चाहते हैं?"))}</button>
      </header>
      <div className="split">
        <div className="stack-lg">
          <section className="stack">
            <div className="spread"><h2>{app.t(L("Recommended matches", "مطابقات مقترحة", "सुझाए गए मेल"))}</h2><button className="btn btn-ghost btn-small" onClick={() => app.go("matches")}>{app.t(L("See all", "عرض الكل", "सभी देखें"))}</button></div>
            {fresh && recommended.length > 0 ? recommended.map(({ listing }) => <ListingCard key={listing.id} listing={listing} />) : (
              <EmptyState icon="compass" title={app.t(L("No matches yet", "لا مطابقات بعد", "अभी कोई मेल नहीं"))} body={app.t(L("List something you have. Matches show up when someone nearby wants it, or when they have what you asked for.", "أدرج ما لديك. تظهر المطابقات عندما يريد شخص قريب ما عرضته، أو عندما يملك ما طلبته.", "जो आपके पास है उसे सूचीबद्ध करें। मेल तब दिखता है जब पास का कोई उसे चाहता है, या उसके पास वह है जो आपने माँगा।"))} action={<button className="btn btn-primary" onClick={() => app.go("create")}>{app.t(L("Create a listing", "أنشئ إعلانًا", "लिस्टिंग बनाएँ"))}</button>} />
            )}
          </section>
          <section className="stack">
            <h2>{app.t(L("Recently listed nearby", "أُدرج حديثًا بالقرب منك", "पास में हाल की लिस्टिंग"))}</h2>
            {nearby.length === 0 ? <EmptyState icon="map" title={app.t(L("No listings nearby", "لا إعلانات قريبة", "पास में कोई लिस्टिंग नहीं"))} body={app.t(L("Widen the radius or try another city in your country.", "وسّع النطاق أو جرّب مدينة أخرى في بلدك.", "दायरा बढ़ाएँ या अपने देश का दूसरा शहर आज़माएँ।"))} action={<button className="btn btn-secondary" onClick={() => app.go("search")}>{app.t(L("Adjust search", "عدّل البحث", "खोज बदलें"))}</button>} /> : (
              <div className="grid-cards">{nearby.map((listing) => <ListingCard key={listing.id} listing={listing} variant="compact" />)}</div>
            )}
          </section>
          {recent.length > 0 ? (
            <section className="stack">
              <h2>{app.t(L("Recently viewed", "شاهدته مؤخرًا", "हाल में देखा"))}</h2>
              <div className="row wrap">{recent.map((listing) => <button key={listing.id} className="chip" onClick={() => app.openListing(listing.id)}>{app.t(listing.title)}</button>)}</div>
            </section>
          ) : null}
        </div>
        <aside className="stack">
          <section className="card pad stack">
            <h2>{app.t(L("Wanted by people near you", "يطلبه أناس بالقرب منك", "पास के लोग यह चाहते हैं"))}</h2>
            {wanted[app.country].map((item) => (
              <div key={item.personId} className="stack">
                <PersonRow id={item.personId} />
                <p>{app.t(item.want)}</p>
                <p className="muted small">{app.t(item.have)}</p>
              </div>
            ))}
          </section>
          <section className="stack">
            <h2>{app.t(L("Categories", "الفئات", "श्रेणियाँ"))}</h2>
            <div className="row wrap">
              {categories.map((category) => (
                <button key={category.id} className="chip" onClick={() => { app.patch({ categoryId: category.id }); app.go("category"); }}>{app.t(category.label)}</button>
              ))}
            </div>
          </section>
          <section className="card pad stack">
            <h2>{app.t(L("Saved search", "بحث محفوظ", "सहेजी खोज"))}</h2>
            {app.story.saved[0] ? (
              <button className="btn btn-secondary" onClick={() => { const saved = app.story.saved[0]; if (!saved) return; app.patch({ search: { ...app.story.search, category: saved.category, max: saved.max ?? app.story.search.max } }); app.go("search"); }}>
                {app.t(app.story.saved[0].title)} · {app.story.saved[0].updates} {app.t(L("new", "جديد", "नई"))}
              </button>
            ) : <p className="muted">{app.t(L("Save a search after you filter.", "احفظ بحثًا بعد التصفية.", "फ़िल्टर के बाद खोज सहेजें।"))}</p>}
          </section>
          <Notice tone="info" title={app.t(L("A reminder, not a lecture", "تذكير لا محاضرة", "एक याद, उपदेश नहीं"))}>
            {app.t(L("Meet in public, inspect before you confirm, and keep cash to the adjustment you agreed. Estimates are not prices we guarantee.", "التقيا في مكان عام، وافحصا قبل التأكيد، واجعلا النقد بقدر التعديل المتفق عليه. التقديرات ليست أسعارًا نضمنها.", "सार्वजनिक जगह मिलें, पुष्टि से पहले जाँचें, और नकद सिर्फ़ तय समायोजन जितना रखें। अनुमान वे कीमतें नहीं हैं जिनकी हम गारंटी देते हैं।"))}
          </Notice>
        </aside>
      </div>
    </div>
  );
}

export function Search() {
  const app = useApp();
  const query = app.story.search;
  const results = listings.filter((listing) => listing.country === app.country && listing.ownerId !== app.meId && passesQuery(listing, query, personById(listing.ownerId), app.story.have, app.story.want));
  const set = (partial: Partial<typeof query>) => app.patch({ search: { ...query, ...partial } });
  return (
    <div className="page stack">
      <div className="spread wrap">
        <h1>{app.t(L("Discover", "استكشف", "खोज"))}</h1>
        <div className="seg">
          <button type="button" aria-pressed={app.story.view === "grid"} onClick={() => app.patch({ view: "grid" })}>{app.t(L("Grid", "شبكة", "ग्रिड"))}</button>
          <button type="button" aria-pressed={app.story.view === "map"} onClick={() => app.go("map")}>{app.t(L("Map", "خريطة", "नक्शा"))}</button>
        </div>
      </div>
      <label className="searchpill" style={{ maxWidth: "100%" }}>
        <Icon name="search" size={18} />
        <input value={query.text} placeholder={app.t(L("Keyword", "كلمة", "शब्द"))} onChange={(e) => set({ text: e.target.value })} />
      </label>
      <div className="row wrap">
        <select aria-label="category" value={query.category} onChange={(e) => set({ category: e.target.value as CategoryId | "any" })}>
          <option value="any">{app.t(L("Any category", "كل الفئات", "कोई भी श्रेणी"))}</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{app.t(category.label)}</option>)}
        </select>
        <select aria-label="kind" value={query.kind} onChange={(e) => set({ kind: e.target.value as "any" | "item" | "service" })}>
          <option value="any">{app.t(L("Items and services", "أغراض وخدمات", "वस्तुएँ और सेवाएँ"))}</option>
          <option value="item">{app.t(L("Items", "أغراض", "वस्तुएँ"))}</option>
          <option value="service">{app.t(L("Services", "خدمات", "सेवाएँ"))}</option>
        </select>
        <select aria-label="city" value={query.city} onChange={(e) => set({ city: e.target.value })}>
          <option value="any">{app.t(L("Any city", "كل المدن", "कोई भी शहर"))}</option>
          {(app.country === "AE" ? ["Dubai", "Abu Dhabi", "Sharjah"] : ["Bengaluru", "Mumbai", "Pune", "Jaipur", "Kochi"]).map((city) => <option key={city}>{city}</option>)}
        </select>
        <select aria-label="handoff" value={query.handoff} onChange={(e) => set({ handoff: e.target.value as Handoff | "any" })}>
          <option value="any">{app.t(L("Any handoff", "كل طرق التسليم", "कोई भी हस्तांतरण"))}</option>
          <option value="meetup">{app.t(L("Public meetup", "لقاء عام", "सार्वजनिक मुलाकात"))}</option>
          <option value="pickup">{app.t(L("Pickup", "استلام", "पिकअप"))}</option>
          <option value="delivery">{app.t(L("Delivery", "توصيل", "डिलीवरी"))}</option>
          <option value="shipping">{app.t(L("Shipping", "شحن", "शिपिंग"))}</option>
        </select>
      </div>
      <div className="row wrap">
        <button className={`chip ${query.cash ? "on" : ""}`} onClick={() => set({ cash: !query.cash })}>{app.t(L("Cash adjustment accepted", "يقبل تعديلًا نقديًا", "नकद समायोजन स्वीकृत"))}</button>
        <button className={`chip ${query.bundles ? "on" : ""}`} onClick={() => set({ bundles: !query.bundles })}>{app.t(L("Multiple items accepted", "يقبل عدة أغراض", "कई वस्तुएँ स्वीकृत"))}</button>
        <button className={`chip ${query.verified ? "on" : ""}`} onClick={() => set({ verified: !query.verified })}>{app.t(L("Verified users only", "الموثّقون فقط", "सिर्फ़ सत्यापित लोग"))}</button>
        <button className={`chip ${query.have ? "on" : ""}`} onClick={() => set({ have: !query.have })}>{app.t(L("Wants something I have", "يريد ما لدي", "उसे वह चाहिए जो मेरे पास है"))}</button>
        <button className={`chip ${query.want ? "on" : ""}`} onClick={() => set({ want: !query.want })}>{app.t(L("Matches my wish list", "يطابق رغباتي", "मेरी चाहत से मेल"))}</button>
        <button className="chip" onClick={() => set({ days: query.days === 7 ? 0 : 7 })}>{app.t(L("Posted this week", "نُشر هذا الأسبوع", "इस हफ़्ते पोस्ट"))}</button>
      </div>
      <div className="row wrap">
        <label className="field">{app.t(L("Minimum", "الحد الأدنى", "न्यूनतम"))}<input type="number" value={query.min} onChange={(e) => set({ min: Number(e.target.value) })} /></label>
        <label className="field">{app.t(L("Maximum", "الحد الأعلى", "अधिकतम"))}<input type="number" value={query.max} onChange={(e) => set({ max: Number(e.target.value) })} /></label>
        <button className="btn btn-secondary" onClick={() => { app.patch({ saved: [{ id: `s-${Date.now()}`, title: L(query.text || "Custom search", query.text || "بحث مخصص", query.text || "कस्टम खोज"), category: query.category, max: query.max, updates: 0 }, ...app.story.saved] }); app.notify(app.t(L("Search saved", "حُفظ البحث", "खोज सहेजी गई"))); }}>{app.t(L("Save this search", "احفظ هذا البحث", "यह खोज सहेजें"))}</button>
      </div>
      <p className="muted">{results.length} {app.t(L("listings", "إعلانات", "लिस्टिंग"))}</p>
      {results.length === 0 ? <EmptyState icon="search" title={app.t(L("Nothing fits those filters", "لا شيء يطابق هذه العوامل", "इन फ़िल्टर पर कुछ नहीं"))} body={app.t(L("Clear a filter or widen the value range. Compatibility labels only appear when we can explain them.", "أزل عاملًا أو وسّع نطاق القيمة. لا تظهر شارات التوافق إلا إذا استطعنا تفسيرها.", "कोई फ़िल्टर हटाएँ या मूल्य सीमा बढ़ाएँ। मेल का लेबल तभी दिखता है जब हम उसे समझा सकें।"))} action={<button className="btn btn-secondary" onClick={() => set({ text: "", category: "any", cash: false, bundles: false, verified: false, have: false, want: false, min: 0 })}>{app.t(L("Clear filters", "مسح العوامل", "फ़िल्टर हटाएँ"))}</button>} /> : (
        <div className="grid-cards">{results.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>
      )}
    </div>
  );
}

export function MapScreen() {
  const app = useApp();
  const pins = listings.filter((listing) => listing.country === app.country && listing.city === app.story.city && listing.pin && !listing.unlisted);
  return (
    <div className="page stack">
      <div className="spread wrap">
        <h1>{app.story.city}</h1>
        <button className="btn btn-secondary btn-small" onClick={() => app.go("search")}>{app.t(L("Grid", "شبكة", "ग्रिड"))}</button>
      </div>
      <p className="muted">{app.t(L("Pins show neighbourhoods, not homes. Exact addresses stay private.", "الدبابيس للأحياء لا للمنازل. العناوين الدقيقة تبقى خاصة.", "पिन मोहल्ले दिखाते हैं, घर नहीं। सटीक पते निजी रहते हैं।"))}</p>
      <div className="map-wrap">
        <svg className="base" viewBox="0 0 800 420" role="img" aria-label={app.story.city}>
          <rect width="800" height="420" fill="transparent" />
          <path d="M40 300 C 140 250, 220 340, 340 280 S 520 180, 760 240" fill="none" stroke="#8aa892" strokeWidth="28" />
          <circle cx="180" cy="250" r="70" fill="#d5e4d4" />
          <circle cx="470" cy="190" r="90" fill="#d7e6ef" />
        </svg>
        {pins.map((listing) => (
          <button key={listing.id} className="pin" style={{ left: `${listing.pin?.x ?? 50}%`, top: `${listing.pin?.y ?? 50}%` }} onClick={() => app.openListing(listing.id)}>
            {app.t(listing.title).split(",")[0]} · <span className="num">{money(listing.value, listing.currency, app.locale)}</span>
          </button>
        ))}
      </div>
      <div className="grid-cards">{pins.map((listing) => <ListingCard key={listing.id} listing={listing} variant="compact" />)}</div>
    </div>
  );
}

export function Category() {
  const app = useApp();
  const category = categories.find((item) => item.id === app.story.categoryId) ?? categories[0];
  const items = listings.filter((listing) => listing.country === app.country && listing.category === category?.id && !listing.unlisted && listing.ownerId !== app.meId);
  if (!category) return null;
  return (
    <div className="page stack">
      <p className="kicker">{app.t(L("Category", "فئة", "श्रेणी"))}</p>
      <h1>{app.t(category.label)}</h1>
      <p className="lead">{app.t(category.blurb)}</p>
      {items.length === 0 ? <EmptyState icon="grid" title={app.t(L("Nothing in this category yet", "لا شيء في هذه الفئة بعد", "इस श्रेणी में अभी कुछ नहीं"))} body={app.t(L("Be the first, or browse another category.", "كن الأول، أو تصفح فئة أخرى.", "पहले बनें, या दूसरी श्रेणी देखें।"))} action={<button className="btn btn-primary" onClick={() => app.go("create")}>{app.t(L("Create a listing", "أنشئ إعلانًا", "लिस्टिंग बनाएँ"))}</button>} /> : <div className="grid-cards">{items.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>}
    </div>
  );
}

export function Listing() {
  const app = useApp();
  const listing = listings.find((item) => item.id === app.story.listingId) ?? listings.find((item) => item.country === app.country && !item.unlisted);
  if (!listing) return null;
  const owner = personById(listing.ownerId);
  const similar = listings.filter((item) => item.category === listing.category && item.id !== listing.id && item.country === app.country && !item.unlisted).slice(0, 2);
  const mine = listing.ownerId === app.meId;
  return (
    <div className="page stack">
      <button className="btn btn-ghost" onClick={app.back}><Icon name="back" /> {app.t(L("Back", "رجوع", "वापस"))}</button>
      <div className="listing-layout">
        <div className="stack">
          <div className="gallery">
            <Art kind={listing.art} label={app.t(listing.title)} />
            <div className="thumbs">
              <button className="on" type="button" aria-label={app.t(L("Photo 1", "صورة 1", "फ़ोटो 1"))}><Art kind={listing.art} label="" /></button>
              <button type="button" aria-label={app.t(L("Photo 2", "صورة 2", "फ़ोटो 2"))}><Art kind={listing.art} label="" /></button>
            </div>
          </div>
          <h1>{app.t(listing.title)}</h1>
          <div className="row wrap">
            <strong className="amount num">{money(listing.value, listing.currency, app.locale)}</strong>
            <span className="pill">{listing.negotiable ? app.t(L("Negotiable estimate", "تقدير قابل للتفاوض", "मोलभाव योग्य अनुमान")) : app.t(L("Fixed estimate", "تقدير ثابت", "निश्चित अनुमान"))}</span>
            <span className="pill">{app.t(listing.condition)}</span>
          </div>
          <Disclaimer />
          {listing.guidance ? <Notice tone="info">{app.t(listing.guidance)}</Notice> : null}
          {listing.committed ? <Notice tone="bad" title={app.t(L("Already committed", "مرتبط بصفقة", "पहले से प्रतिबद्ध"))}>{app.t(L("This listing is in an accepted trade. It cannot be added to another proposal.", "هذا الإعلان داخل صفقة مقبولة. لا يمكن إضافته إلى اقتراح آخر.", "यह लिस्टिंग एक स्वीकृत सौदे में है। इसे दूसरे प्रस्ताव में नहीं जोड़ा जा सकता।"))}</Notice> : null}
          <p>{app.t(listing.description)}</p>
          <h2>{app.t(L("Details", "التفاصيل", "विवरण"))}</h2>
          <div className="kv">{listing.specs.map((spec) => (
            <div key={spec.label.en} className="spread"><span>{app.t(spec.label)}</span><strong>{app.t(spec.value)}</strong></div>
          ))}</div>
          <p><strong>{app.t(L("Defects", "العيوب", "दोष"))}</strong> — {app.t(listing.defects)}</p>
          <h2>{app.t(L("What they want", "ماذا يريدون", "वे क्या चाहते हैं"))}</h2>
          <p>{app.t(listing.wants)}</p>
          <div className="row wrap">
            {listing.wantTags.map((tag) => <span key={tag} className="pill">{tag}</span>)}
            {listing.cashOk ? <span className="pill">{app.t(L("Cash adjustment accepted", "يقبل تعديلًا نقديًا", "नकद समायोजन स्वीकृत"))}</span> : <span className="pill">{app.t(L("No cash adjustment", "بدون تعديل نقدي", "नकद समायोजन नहीं"))}</span>}
            {listing.bundlesOk ? <span className="pill">{app.t(L("Bundles accepted in a proposal", "الحزم تُقبل داخل اقتراح", "बंडल प्रस्ताव में स्वीकृत"))}</span> : null}
          </div>
          <h2>{app.t(L("Exchange", "التبادل", "अदला-बदली"))}</h2>
          <p>{listing.handoff.join(", ")} · {listing.area}, {listing.city}</p>
          <p className="muted">{app.t(listing.handoffNote)}</p>
          <Notice tone="info" title={app.t(L("Before you meet", "قبل اللقاء", "मिलने से पहले"))}>{app.t(L("Inspect the item before you confirm completion. Do not share a home address in chat.", "افحص الغرض قبل تأكيد الإتمام. لا تشارك عنوان المنزل في الدردشة.", "पूरा होने की पुष्टि से पहले वस्तु जाँचें। चैट में घर का पता साझा न करें।"))}</Notice>
        </div>
        <aside className="card pad stack sticky-side">
          {owner ? (
            <button className="spread" style={{ background: "none", border: 0, padding: 0, textAlign: "start" }} onClick={() => app.openProfile(owner.id)}>
              <span className="row"><span className={`avatar tone-${owner.tone}`}>{app.t(owner.initials)}</span><span><strong>{app.t(owner.name)}</strong><span className="muted small" style={{ display: "block" }}>{owner.rating > 0 ? `${owner.rating.toFixed(1)} · ${owner.reviews}` : app.t(L("New member", "عضو جديد", "नए सदस्य"))} · {app.t(owner.identityNote)}</span></span></span>
              <Icon name="chevron" />
            </button>
          ) : null}
          {mine ? <button className="btn btn-primary btn-block" onClick={() => app.go("manage")}>{app.t(L("Manage listing", "إدارة الإعلان", "लिस्टिंग संभालें"))}</button> : (
            <button className="btn btn-primary btn-block" disabled={Boolean(listing.committed) || app.story.scenario === "restricted"} onClick={() => {
              app.updateDraft({ theirIds: [listing.id], yourIds: app.country === "AE" ? ["ipad"] : ["sony"], mode: "new", yourCash: 0, ack: false });
              app.go("proposal");
            }}>{app.t(L("Propose a trade", "اقترح صفقة", "सौदा प्रस्तावित करें"))}</button>
          )}
          <div className="row">
            <button className="btn btn-secondary" onClick={() => { app.patch({ threadId: listing.ownerId }); app.go("thread"); }}>{app.t(L("Message", "مراسلة", "संदेश"))}</button>
            <button className="btn btn-secondary" onClick={() => app.toggleFavorite(listing.id)}>{app.story.favorites.includes(listing.id) ? app.t(L("Saved", "محفوظ", "सहेजा")) : app.t(L("Save", "حفظ", "सहेजें"))}</button>
            <button className="btn btn-secondary" onClick={() => { app.setSheet("share"); }}>{app.t(L("Share", "مشاركة", "साझा करें"))}</button>
          </div>
          <button className="btn btn-ghost" onClick={() => app.go("report")}>{app.t(L("Report this listing", "أبلغ عن هذا الإعلان", "इस लिस्टिंग की रिपोर्ट करें"))}</button>
        </aside>
      </div>
      {similar.length > 0 ? <section className="stack"><h2>{app.t(L("Similar listings", "إعلانات مشابهة", "मिलती-जुलती लिस्टिंग"))}</h2><div className="grid-cards">{similar.map((item) => <ListingCard key={item.id} listing={item} variant="compact" />)}</div></section> : null}
      {app.sheet === "share" ? <div className="backdrop" onClick={() => app.setSheet(null)}><div className="sheet stack" role="dialog" onClick={(e) => e.stopPropagation()}><h2>{app.t(L("Share", "مشاركة", "साझा करें"))}</h2><p>{app.t(listing.title)} · {money(listing.value, listing.currency, app.locale)}</p><button className="btn btn-primary" onClick={() => { app.setSheet(null); app.notify(app.t(L("Link copied", "نُسخ الرابط", "लिंक कॉपी हुआ"))); }}>{app.t(L("Copy link", "نسخ الرابط", "लिंक कॉपी करें"))}</button></div></div> : null}
    </div>
  );
}

export function Matches() {
  const app = useApp();
  const rows = listings.filter((listing) => listing.country === app.country && !listing.unlisted && listing.ownerId !== app.meId).map((listing) => ({ listing, match: explainMatch(listing, app.story.have, app.story.want) })).filter((row) => row.match.level);
  return (
    <div className="page stack">
      <h1>{app.t(L("Matches", "المطابقات", "मेल"))}</h1>
      <p className="muted">{app.t(L("Strong, good, and possible are labels with reasons. There is no hidden percentage.", "قوية وجيدة وممكنة تسميات مع أسباب. لا توجد نسبة مخفية.", "मजबूत, अच्छा और संभावित कारणों के साथ लेबल हैं। कोई छिपा प्रतिशत नहीं।"))}</p>
      {rows.length === 0 ? <EmptyState icon="spark" title={app.t(L("No matches yet", "لا مطابقات بعد", "अभी कोई मेल नहीं"))} body={app.t(L("Add an “I have” and an “I want” category.", "أضف فئة «لدي» وفئة «أريد».", "एक “मेरे पास है” और एक “मुझे चाहिए” श्रेणी जोड़ें।"))} /> : rows.map(({ listing }) => <ListingCard key={listing.id} listing={listing} />)}
    </div>
  );
}

export function Favorites() {
  const app = useApp();
  const items = app.story.favorites.map((id) => listings.find((listing) => listing.id === id)).filter((item): item is Listing => Boolean(item));
  return (
    <div className="page stack">
      <h1>{app.t(L("Favorites", "المحفوظات", "सहेजे गए"))}</h1>
      {items.length === 0 ? <EmptyState icon="heart" title={app.t(L("Nothing saved", "لا محفوظات", "कुछ सहेजा नहीं"))} body={app.t(L("Save a listing to compare it later. Saving does not reserve it.", "احفظ إعلانًا لمقارنته لاحقًا. الحفظ لا يحجز الغرض.", "बाद में तुलना के लिए लिस्टिंग सहेजें। सहेजना उसे रोकता नहीं।"))} action={<button className="btn btn-primary" onClick={() => app.go("search")}>{app.t(L("Discover", "استكشف", "खोज"))}</button>} /> : <div className="grid-cards">{items.map((listing) => <ListingCard key={listing.id} listing={listing} />)}</div>}
    </div>
  );
}

export function Saved() {
  const app = useApp();
  return (
    <div className="page stack">
      <h1>{app.t(L("Saved searches", "عمليات البحث المحفوظة", "सहेजी खोजें"))}</h1>
      {app.story.saved.length === 0 ? <EmptyState icon="search" title={app.t(L("No saved searches", "لا عمليات بحث محفوظة", "कोई सहेजी खोज नहीं"))} body={app.t(L("Save a search from Discover and we will tell you when new listings fit.", "احفظ بحثًا من الاستكشاف وسنخبرك عند وجود إعلانات مناسبة.", "खोज से खोज सहेजें। नई उपयुक्त लिस्टिंग पर हम बताएँगे।"))} /> : app.story.saved.map((saved) => (
        <button key={saved.id} className="card pad spread" onClick={() => { app.patch({ search: { ...app.story.search, category: saved.category, max: saved.max ?? app.story.search.max } }); app.go("search"); }}>
          <span><strong>{app.t(saved.title)}</strong><span className="muted small" style={{ display: "block" }}>{saved.updates} {app.t(L("new since yesterday", "جديد منذ الأمس", "कल से नई"))}</span></span>
          <Icon name="chevron" />
        </button>
      ))}
    </div>
  );
}
