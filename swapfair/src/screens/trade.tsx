import { useEffect, useState } from "react";
import { L } from "../copy";
import { listingById, listings, personById } from "../data";
import { balanceKind, changedRows, gapSentence, handoffLabel, money, scanPolicy, sideTotal, statusLabel, tradeStatus, versionTotals } from "../logic";
import { useApp } from "../state";
import type { Handoff, Listing } from "../types";
import { BalanceBar, Disclaimer, EmptyState, Notice, PolicyNotice, StatusPill } from "../ui";
import { Icon } from "../icons";

function useSides() {
  const app = useApp();
  const draft = app.story.draft;
  const resolve = (ids: string[]) => ids.map((id) => {
    const listing = listingById(id);
    if (!listing) return null;
    return { listing, value: draft.values[id] ?? listing.value };
  }).filter((item): item is { listing: Listing; value: number } => Boolean(item));
  const yours = resolve(draft.yourIds);
  const theirs = resolve(draft.theirIds);
  const yourTotal = sideTotal(yours.map((item) => item.value), draft.yourCash);
  const theirTotal = sideTotal(theirs.map((item) => item.value), draft.theirCash);
  const currency = yours[0]?.listing.currency ?? theirs[0]?.listing.currency ?? (app.country === "AE" ? "AED" : "INR");
  return { yours, theirs, yourTotal, theirTotal, currency };
}

export function Proposal() {
  const app = useApp();
  const { yours, theirs, yourTotal, theirTotal, currency } = useSides();
  const kind = balanceKind(yourTotal, theirTotal, currency, app.story.draft.ack);
  const inventory = listings.filter((listing) => listing.ownerId === app.meId && listing.country === app.country);
  const focus = listingById(app.story.draft.theirIds[0] ?? "") ?? listingById(app.story.listingId);
  const partnerId = focus && focus.ownerId !== app.meId ? focus.ownerId : app.country === "AE" ? "rohan" : "priya";
  const theirsPool = listings.filter((listing) => listing.ownerId === partnerId && listing.country === app.country);
  const blocked = scanPolicy(`${app.story.draft.request} ${app.story.draft.message}`);
  const gap = theirTotal - yourTotal;
  const toggle = (side: "yourIds" | "theirIds", id: string) => {
    const list = app.story.draft[side];
    app.updateDraft({ [side]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] });
  };
  const submit = () => {
    if (blocked.outcome === "prohibited") return;
    if (yours.length === 0 || theirs.length === 0) return;
    if (kind === "significant" && !app.story.draft.ack) {
      app.setSheet("ack");
      return;
    }
    app.setSheet("preview");
  };
  return (
    <div className="page stack">
      <header className="stack">
        <p className="kicker">{app.story.draft.mode === "counter" ? app.t(L("New version", "نسخة جديدة", "नया संस्करण")) : app.t(L("Proposal", "اقتراح", "प्रस्ताव"))}</p>
        <h1>{app.t(L("Build the trade", "ابنِ الصفقة", "सौदा बनाएँ"))}</h1>
        {app.story.draft.mode === "counter" ? <Notice>{app.t(L("Sending this creates a new version. The previous version stays unchanged.", "الإرسال ينشئ نسخة جديدة. النسخة السابقة تبقى كما هي.", "भेजने से नया संस्करण बनता है। पिछला संस्करण वैसा ही रहता है।"))}</Notice> : null}
      </header>
      <div className="proposal">
        <section className="card pad stack">
          <h2>{app.t(L("Your offer", "عرضك", "आपका प्रस्ताव"))}</h2>
          {inventory.map((listing) => (
            <label key={listing.id} className={`choice ${app.story.draft.yourIds.includes(listing.id) ? "on" : ""}`}>
              <input type="checkbox" checked={app.story.draft.yourIds.includes(listing.id)} onChange={() => toggle("yourIds", listing.id)} />
              <span>
                <strong>{app.t(listing.title)}</strong>
                {listing.unlisted ? <span className="pill">{app.t(L("Unlisted item", "غرض غير منشور", "असूचीबद्ध वस्तु"))}</span> : null}
                <span className="muted small" style={{ display: "block" }}>{money(app.story.draft.values[listing.id] ?? listing.value, listing.currency, app.locale)}</span>
              </span>
            </label>
          ))}
          {inventory.length === 0 ? <p className="muted">{app.t(L("Publish a listing or add an eligible unlisted item first.", "انشر إعلانًا أو أضف غرضًا مؤهلًا غير منشور أولًا.", "पहले लिस्टिंग प्रकाशित करें या एक उपयुक्त असूचीबद्ध वस्तु जोड़ें।"))}</p> : null}
          <label className="field"><span>{app.t(L("Your cash adjustment", "تعديلك النقدي", "आपका नकद समायोजन"))}</span>
            <input className="num" type="number" min={0} value={app.story.draft.yourCash} onChange={(e) => app.updateDraft({ yourCash: Math.max(0, Number(e.target.value)) })} />
          </label>
          <p className="small muted">{app.t(L("Cash balances a trade. It is not a listing.", "النقد يوازن الصفقة. ليس إعلانًا.", "नकद सौदे को संतुलित करता है। यह लिस्टिंग नहीं है।"))}</p>
        </section>
        <section className="card pad stack">
          <h2>{app.t(L("Their offer", "عرضهم", "उनका प्रस्ताव"))}</h2>
          {theirsPool.map((listing) => (
            <label key={listing.id} className={`choice ${app.story.draft.theirIds.includes(listing.id) ? "on" : ""}`}>
              <input type="checkbox" disabled={listing.committed} checked={app.story.draft.theirIds.includes(listing.id)} onChange={() => toggle("theirIds", listing.id)} />
              <span>
                <strong>{app.t(listing.title)}</strong>
                <span className="muted small" style={{ display: "block" }}>{listing.committed ? app.t(L("Already in an accepted trade", "مرتبط بصفقة مقبولة", "पहले से स्वीकृत सौदे में")) : money(app.story.draft.values[listing.id] ?? listing.value, listing.currency, app.locale)}</span>
              </span>
            </label>
          ))}
          {app.story.draft.theirIds.map((id) => {
            const listing = listingById(id);
            if (!listing?.negotiable) return null;
            return (
              <label key={id} className="field"><span>{app.t(L("Proposed value for {name}", "القيمة المقترحة لـ {name}", "{name} का प्रस्तावित मूल्य"), { name: app.t(listing.title) })}</span>
                <input className="num" type="number" value={app.story.draft.values[id] ?? listing.value} onChange={(e) => app.updateDraft({ values: { ...app.story.draft.values, [id]: Number(e.target.value) } })} />
              </label>
            );
          })}
          <label className="field"><span>{app.t(L("Ask them to add cash", "اطلب منهم إضافة نقد", "उनसे नकद जोड़ने को कहें"))}</span>
            <input className="num" type="number" min={0} value={app.story.draft.theirCash} onChange={(e) => app.updateDraft({ theirCash: Math.max(0, Number(e.target.value)) })} />
          </label>
          <label className="field"><span>{app.t(L("Request an additional item", "اطلب غرضًا إضافيًا", "एक और वस्तु माँगें"))}</span>
            <input value={app.story.draft.request} onChange={(e) => app.updateDraft({ request: e.target.value })} />
          </label>
        </section>
        <aside className="card pad stack sticky-side">
          <h2>{app.t(L("Trade summary", "ملخص الصفقة", "सौदे का सार"))}</h2>
          <BalanceBar yours={yourTotal} theirs={theirTotal} currency={currency} accepted={app.story.draft.ack && kind !== "balanced"} />
          <div className="kv">
            <span>{app.t(L("Your items", "أغراضك", "आपकी वस्तुएँ"))}</span><strong className="num">{money(yourTotal - app.story.draft.yourCash, currency, app.locale)}</strong>
            <span>{app.t(L("Your cash", "نقدك", "आपका नकद"))}</span><strong className="num">{money(app.story.draft.yourCash, currency, app.locale)}</strong>
            <span>{app.t(L("Their items", "أغراضهم", "उनकी वस्तुएँ"))}</span><strong className="num">{money(theirTotal - app.story.draft.theirCash, currency, app.locale)}</strong>
            <span>{app.t(L("Their cash", "نقدهم", "उनका नकद"))}</span><strong className="num">{money(app.story.draft.theirCash, currency, app.locale)}</strong>
          </div>
          <div className="stack">
            {gap > 0 ? <button className="btn btn-secondary btn-small" onClick={() => app.updateDraft({ yourCash: app.story.draft.yourCash + gap })}>{app.t(L("Add {amount} cash", "أضف {amount} نقدًا", "{amount} नकद जोड़ें"), { amount: money(gap, currency, app.locale) })}</button> : null}
            {gap < 0 ? <button className="btn btn-secondary btn-small" onClick={() => app.updateDraft({ theirCash: app.story.draft.theirCash + Math.abs(gap) })}>{app.t(L("Ask them to add {amount}", "اطلب إضافة {amount}", "उनसे {amount} जोड़ने को कहें"), { amount: money(Math.abs(gap), currency, app.locale) })}</button> : null}
            {gap < 0 ? <button className="btn btn-ghost btn-small" onClick={() => app.notify(app.t(L("Remove an item on your side, or lower a proposed value.", "أزل غرضًا من طرفك أو خفّض قيمة مقترحة.", "अपने पक्ष से वस्तु हटाएँ, या प्रस्तावित मूल्य घटाएँ।")))}>{app.t(L("Reduce your side", "خفّض طرفك", "अपना पक्ष घटाएँ"))}</button> : null}
            {gap !== 0 ? <button className="btn btn-ghost btn-small" onClick={() => { if (kind === "significant") app.setSheet("ack"); else app.updateDraft({ ack: true }); }}>{app.t(L("Continue with this difference", "تابع مع هذا الفرق", "इस अंतर के साथ आगे बढ़ें"))}</button> : null}
          </div>
          <p className="small muted">{app.t(L("A difference is not unfair if both people accept it.", "الفرق ليس غير عادل إذا قبله الطرفان.", "अंतर अन्याय नहीं है अगर दोनों उसे मानते हैं।"))}</p>
          <button className="btn btn-primary" disabled={blocked.outcome === "prohibited" || yours.length === 0 || theirs.length === 0} onClick={submit}>{app.t(L("Review and send", "راجع وأرسل", "देखें और भेजें"))}</button>
        </aside>
      </div>
      <section className="card pad stack">
        <h2>{app.t(L("With the proposal", "مع الاقتراح", "प्रस्ताव के साथ"))}</h2>
        <label className="field"><span>{app.t(L("Message", "رسالة", "संदेश"))}</span><textarea value={app.story.draft.message} onChange={(e) => app.updateDraft({ message: e.target.value })} /></label>
        <label className="field"><span>{app.t(L("Public place", "مكان عام", "सार्वजनिक जगह"))}</span><input value={app.story.draft.place} onChange={(e) => app.updateDraft({ place: e.target.value })} placeholder={app.country === "AE" ? "Dubai Mall, near the waterfall" : "100 Feet Road, outside a café"} /></label>
        <label className="field"><span>{app.t(L("When", "الموعد", "कब"))}</span><input value={app.story.draft.date} onChange={(e) => app.updateDraft({ date: e.target.value })} /></label>
        <label className="field"><span>{app.t(L("Method", "الطريقة", "तरीका"))}</span>
          <select value={app.story.draft.method} onChange={(e) => app.updateDraft({ method: e.target.value as Handoff })}>
            <option value="meetup">{app.t(handoffLabel("meetup"))}</option>
            <option value="pickup">{app.t(handoffLabel("pickup"))}</option>
            <option value="delivery">{app.t(handoffLabel("delivery"))}</option>
            <option value="shipping">{app.t(handoffLabel("shipping"))}</option>
          </select>
        </label>
        <label className="field"><span>{app.t(L("Conditions", "شروط", "शर्तें"))}</span><input value={app.story.draft.conditions} onChange={(e) => app.updateDraft({ conditions: e.target.value })} /></label>
      </section>
      {blocked.outcome === "prohibited" ? <Notice tone="bad" title={blocked.category ? app.t(blocked.category) : ""}>{blocked.message ? app.t(blocked.message) : null}<PolicyNotice /></Notice> : null}
      {app.story.draft.method === "shipping" ? <Notice tone="warn">{app.t(L("Agree who pays shipping. SwapFair does not guarantee delivery. Cross-border shipping is off.", "اتفقا على من يدفع الشحن. SwapFair لا تضمن التوصيل. الشحن عبر الحدود متوقف.", "तय करें शिपिंग कौन देगा। SwapFair डिलीवरी की गारंटी नहीं देता। सीमा-पार शिपिंग बंद है।"))}</Notice> : null}
      <div className="sticky-bar">
        <div>
          <strong>{gapSentence(yourTotal, theirTotal, currency, app.locale)}</strong>
          <div className={`pill ${kind === "balanced" ? "good" : "warn"}`}>{app.t(kind === "balanced" ? L("Balanced", "متوازنة", "संतुलित") : kind === "significant" ? L("Significant difference", "فرق كبير", "बड़ा अंतर") : kind === "accepted" ? L("Accepted difference", "فرق مقبول", "स्वीकृत अंतर") : L("Small difference", "فرق بسيط", "थोड़ा अंतर"))}</div>
        </div>
        <button className="btn btn-primary" disabled={blocked.outcome === "prohibited" || yours.length === 0 || theirs.length === 0} onClick={submit}>{app.t(L("Review and send", "راجع وأرسل", "देखें और भेजें"))}</button>
      </div>
      {app.sheet === "ack" ? (
        <div className="backdrop" onClick={() => app.setSheet(null)}><div className="sheet stack" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <h2>{app.t(L("This difference is significant", "هذا الفرق كبير", "यह अंतर बड़ा है"))}</h2>
          <p>{gapSentence(yourTotal, theirTotal, currency, app.locale)}. {app.t(L("Significant means more than 15% of the higher side, or more than AED 400 / ₹10,000.", "الكبير يعني أكثر من 15٪ من الطرف الأعلى، أو أكثر من 400 درهم / 10000 روبية.", "बड़ा मतलब ऊँचे पक्ष का 15% से अधिक, या 400 दिरहम / ₹10,000 से अधिक।"))}</p>
          <label className="check"><input type="checkbox" checked={app.story.draft.ack} onChange={(e) => app.updateDraft({ ack: e.target.checked })} /><span>{app.t(L("I understand the two sides are not equal, and I still want to send this proposal.", "أفهم أن الطرفين غير متساويين، وأريد إرسال الاقتراح رغم ذلك.", "मैं समझता हूँ कि दोनों पक्ष बराबर नहीं हैं, और फिर भी यह प्रस्ताव भेजना चाहता हूँ।"))}</span></label>
          <button className="btn btn-primary" disabled={!app.story.draft.ack} onClick={() => app.setSheet("preview")}>{app.t(L("Continue", "متابعة", "आगे बढ़ें"))}</button>
        </div></div>
      ) : null}
      {app.sheet === "preview" ? (
        <div className="backdrop" onClick={() => app.setSheet(null)}><div className="sheet stack" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <h2>{app.t(L("Final preview", "المعاينة النهائية", "अंतिम झलक"))}</h2>
          <BalanceBar yours={yourTotal} theirs={theirTotal} currency={currency} accepted={app.story.draft.ack} />
          <p>{yours.map((item) => app.t(item.listing.title)).join(", ")} + {money(app.story.draft.yourCash, currency, app.locale)}</p>
          <p>{theirs.map((item) => app.t(item.listing.title)).join(", ")} + {money(app.story.draft.theirCash, currency, app.locale)}</p>
          <p>{app.story.draft.place} · {app.story.draft.date}</p>
          <Disclaimer />
          <button className="btn btn-primary" onClick={app.sendProposal}>{app.t(L("Send proposal", "إرسال الاقتراح", "प्रस्ताव भेजें"))}</button>
        </div></div>
      ) : null}
    </div>
  );
}

export function Offer() {
  const app = useApp();
  const versions = app.story.versions;
  const current = versions[versions.length - 1];
  const status = tradeStatus(app.story);
  if (!current || !status) {
    return <div className="page"><EmptyState icon="trades" title={app.t(L("No proposals", "لا اقتراحات", "कोई प्रस्ताव नहीं"))} body={app.t(L("When you send or receive a trade, it lives here — separate from ordinary messages.", "عندما ترسل أو تستقبل صفقة، تظهر هنا، منفصلة عن الرسائل العادية.", "जब आप सौदा भेजेंगे या पाएँगे, वह यहाँ रहेगा — सामान्य संदेशों से अलग।"))} action={<button className="btn btn-primary" onClick={() => app.go("matches")}>{app.t(L("Find a match", "ابحث عن مطابقة", "मेल खोजें"))}</button>} /></div>;
  }
  const totals = versionTotals(current);
  const currency = app.country === "AE" ? "AED" : "INR";
  const locked = app.story.locked !== null;
  return (
    <div className="page narrow stack">
      <div className="spread wrap"><h1>{app.t(L("Version {n}", "النسخة {n}", "संस्करण {n}"), { n: current.n })}</h1><StatusPill status={status} /></div>
      <p className="muted">{current.sender === "me" ? app.t(L("You sent this", "أرسلت هذا", "आपने भेजा")) : app.t(L("They sent this", "أرسلوا هذا", "उन्होंने भेजा"))} · {current.at}</p>
      {locked ? <Notice tone="good" title={app.t(L("Terms locked", "شروط مثبتة", "शर्तें लॉक"))}>{app.t(L("These terms are locked. Any change needs a new version, and both people must confirm it.", "هذه الشروط مثبتة. أي تغيير يحتاج نسخة جديدة وتأكيد الطرفين.", "ये शर्तें लॉक हैं। किसी बदलाव के लिए नया संस्करण चाहिए, और दोनों को स्वीकार करना होगा।"))}</Notice> : null}
      <BalanceBar yours={totals.yours} theirs={totals.theirs} currency={currency} />
      <article className="card pad stack">
        <h2>{app.t(L("Your side", "طرفك", "आपका पक्ष"))}</h2>
        {current.your.map((item) => <div key={item.id} className="spread"><span>{app.t(item.title)}</span><span className="num">{money(item.value, currency, app.locale)}</span></div>)}
        <div className="spread"><span>{app.t(L("Cash adjustment", "تعديل نقدي", "नकद समायोजन"))}</span><span className="num">{money(current.yourCash, currency, app.locale)}</span></div>
        <h2>{app.t(L("Their side", "طرفهم", "उनका पक्ष"))}</h2>
        {current.their.map((item) => <div key={item.id} className="spread"><span>{app.t(item.title)}</span><span className="num">{money(item.value, currency, app.locale)}</span></div>)}
        <div className="spread"><span>{app.t(L("Cash adjustment", "تعديل نقدي", "नकद समायोजन"))}</span><span className="num">{money(current.theirCash, currency, app.locale)}</span></div>
        <p>{current.place} · {current.date}</p>
        <p>{current.note}</p>
      </article>
      <div className="stack">
        {versions.map((version) => (
          <button key={version.n} className="card pad spread" onClick={() => app.go("compare")}>
            <span>{app.t(L("Version {n}", "النسخة {n}", "संस्करण {n}"), { n: version.n })} · {version.at}</span>
            <Icon name="chevron" />
          </button>
        ))}
      </div>
      {!locked && app.story.outcome === "open" ? (
        <div className="row wrap">
          <button className="btn btn-primary" onClick={() => app.acceptLocked(current.n)}>{app.t(L("Accept", "قبول", "स्वीकार करें"))}</button>
          <button className="btn btn-secondary" onClick={() => { app.updateDraft({ mode: "counter", yourIds: current.your.map((item) => item.id), theirIds: current.their.map((item) => item.id), yourCash: current.yourCash, theirCash: current.theirCash, place: current.place, date: current.date, message: "" }); app.go("proposal"); }}>{app.t(L("Counter", "عرض مقابل", "प्रतिप्रस्ताव"))}</button>
          <button className="btn btn-secondary" onClick={app.declineTrade}>{app.t(L("Decline", "رفض", "अस्वीकार करें"))}</button>
          <button className="btn btn-ghost" onClick={app.withdrawTrade}>{app.t(L("Withdraw", "سحب", "वापस लें"))}</button>
          <button className="btn btn-ghost" onClick={() => app.go("thread")}>{app.t(L("Ask a question", "اطرح سؤالًا", "सवाल पूछें"))}</button>
          {app.story.phase === "sent" ? <button className="btn btn-secondary" onClick={app.simulateCounter}>{app.t(L("Simulate their counteroffer", "حاكِ عرضهم المقابل", "उनका प्रतिप्रस्ताव दिखाएँ"))}</button> : null}
        </div>
      ) : <button className="btn btn-primary" onClick={() => app.go("workspace")}>{app.t(L("Open the trade", "افتح الصفقة", "सौदा खोलें"))}</button>}
    </div>
  );
}

export function Compare() {
  const app = useApp();
  const versions = app.story.versions;
  const [left, setLeft] = useState(Math.max(1, versions.length - 1));
  const [right, setRight] = useState(Math.max(1, versions.length));
  const prev = versions.find((version) => version.n === left) ?? versions[0];
  const next = versions.find((version) => version.n === right) ?? versions[versions.length - 1];
  if (!prev || !next) return <div className="page"><EmptyState icon="scale" title={app.t(L("Nothing to compare", "لا شيء للمقارنة", "तुलना के लिए कुछ नहीं"))} body={app.t(L("Send a proposal first. Each counteroffer becomes its own version.", "أرسل اقتراحًا أولًا. كل عرض مقابل يصبح نسخة مستقلة.", "पहले प्रस्ताव भेजें। हर प्रतिप्रस्ताव अपना संस्करण बनता है।"))} /></div>;
  const currency = app.country === "AE" ? "AED" : "INR";
  const rows = changedRows(prev, next, app.locale, currency);
  return (
    <div className="page stack">
      <h1>{app.t(L("Previous offer → current offer", "العرض السابق ← العرض الحالي", "पिछला ऑफ़र → मौजूदा ऑफ़र"))}</h1>
      <div className="row wrap">
        <label className="field">{app.t(L("Previous", "السابق", "पिछला"))}<select value={left} onChange={(e) => setLeft(Number(e.target.value))}>{versions.map((version) => <option key={version.n} value={version.n}>{version.n}</option>)}</select></label>
        <label className="field">{app.t(L("Current", "الحالي", "मौजूदा"))}<select value={right} onChange={(e) => setRight(Number(e.target.value))}>{versions.map((version) => <option key={version.n} value={version.n}>{version.n}</option>)}</select></label>
      </div>
      <div className="compare">
        {rows.map((row) => (
          <article key={`${row.label}-${row.before}-${row.after}`}>
            <div className="row wrap">
              <Icon name={row.kind === "added" ? "plus" : row.kind === "removed" ? "close" : row.kind === "changed" ? "edit" : "check"} size={18} />
              <strong>{row.kind === "added" ? app.t(L("Added", "أُضيف", "जोड़ा गया")) : row.kind === "removed" ? app.t(L("Removed", "أُزيل", "हटाया गया")) : row.kind === "changed" ? app.t(L("Changed", "تغيّر", "बदला")) : app.t(L("Unchanged", "بلا تغيير", "बिना बदलाव"))}</strong>
              <span>{row.label}</span>
            </div>
            <div className="grid-2">
              <p><span className="muted small">{app.t(L("Previous", "السابق", "पिछला"))}</span><br />{row.before}</p>
              <p><span className="muted small">{app.t(L("Current", "الحالي", "मौजूदा"))}</span><br />{row.after}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => app.acceptLocked(next.n)}>{app.t(L("Accept current version", "اقبل النسخة الحالية", "मौजूदा संस्करण स्वीकार करें"))}</button>
        <button className="btn btn-secondary" onClick={() => app.go("offer")}>{app.t(L("Back to the offer", "العودة إلى العرض", "ऑफ़र पर वापस"))}</button>
      </div>
    </div>
  );
}

export function Trades() {
  const app = useApp();
  const status = tradeStatus(app.story);
  const partner = personById(app.country === "AE" ? "rohan" : "priya");
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Trades", "الصفقات", "सौदे"))}</h1>
      <p className="muted">{app.t(L("A trade is the agreement: items, values, and status. A message is only the conversation.", "الصفقة هي الاتفاق: الأغراض والقيم والحالة. الرسالة مجرد حديث.", "सौदा समझौता है: वस्तुएँ, मूल्य और स्थिति। संदेश सिर्फ़ बातचीत है।"))}</p>
      {!status || !partner ? <EmptyState icon="trades" title={app.t(L("No proposals", "لا اقتراحات", "कोई प्रस्ताव नहीं"))} body={app.t(L("Propose a trade from a listing. It will not get lost in chat.", "اقترح صفقة من إعلان. لن تضيع داخل الدردشة.", "लिस्टिंग से सौदा प्रस्तावित करें। वह चैट में नहीं खोएगा।"))} action={<button className="btn btn-primary" onClick={() => app.go("matches")}>{app.t(L("See matches", "عرض المطابقات", "मेल देखें"))}</button>} /> : (
        <button className="card pad stack" onClick={() => app.go(app.story.locked ? "workspace" : "offer")}>
          <div className="spread"><strong>{app.t(partner.short)}</strong><StatusPill status={status} /></div>
          <p className="muted">{app.t(statusLabel(status))}</p>
        </button>
      )}
      <button className="btn btn-secondary" onClick={() => app.go("messages")}>{app.t(L("Open messages", "افتح الرسائل", "संदेश खोलें"))}</button>
    </div>
  );
}

export function Workspace() {
  const app = useApp();
  const status = tradeStatus(app.story);
  const version = app.story.versions.find((item) => item.n === app.story.locked) ?? app.story.versions[app.story.versions.length - 1];
  const partner = personById(app.country === "AE" ? "rohan" : "priya");
  if (!version || !status || !partner) return <div className="page"><EmptyState icon="lock" title={app.t(L("No active trade", "لا صفقة نشطة", "कोई सक्रिय सौदा नहीं"))} body={app.t(L("Accept a proposal to open a workspace.", "اقبل اقتراحًا لفتح مساحة الصفقة.", "कार्यक्षेत्र खोलने के लिए प्रस्ताव स्वीकार करें।"))} action={<button className="btn btn-primary" onClick={() => app.go("trades")}>{app.t(L("Back to trades", "إلى الصفقات", "सौदों पर वापस"))}</button>} /></div>;
  const currency = app.country === "AE" ? "AED" : "INR";
  const totals = versionTotals(version);
  const events = [
    app.t(L("Version 1 proposed", "اقتُرحت النسخة 1", "संस्करण 1 प्रस्तावित")),
    app.story.versions.length > 1 ? app.t(L("Version 2 countered", "قُوبلت بالنسخة 2", "संस्करण 2 का प्रतिप्रस्ताव")) : "",
    app.story.locked ? app.t(L("Version {n} accepted and locked", "قُبلت النسخة {n} وثُبّتت", "संस्करण {n} स्वीकृत और लॉक"), { n: app.story.locked }) : "",
    app.story.meetup ? app.t(L("Meetup scheduled", "حُدد اللقاء", "मुलाकात तय")) : "",
    app.story.checkedIn ? app.t(L("Safety check-in", "تسجيل سلامة", "सुरक्षा चेक-इन")) : "",
    app.story.scenario === "meetup-cancelled" ? app.t(L("Rohan cancelled the meetup because of a work trip.", "ألغى روهان اللقاء بسبب رحلة عمل.", "रोहन ने काम की यात्रा के कारण मुलाकात रद्द की।")) : "",
    app.story.scenario === "disputed" ? app.t(L("A dispute was opened", "فُتح نزاع", "विवाद खोला गया")) : "",
    app.story.meConfirmed ? app.t(L("You confirmed completion", "أكّدت الإتمام", "आपने पूरा होने की पुष्टि की")) : "",
    app.story.themConfirmed ? app.t(L("They confirmed completion", "أكّدوا الإتمام", "उन्होंने पूरा होने की पुष्टि की")) : "",
  ].filter(Boolean);
  return (
    <div className="page stack">
      <div className="spread wrap"><h1>{app.t(L("Trade with {name}", "صفقة مع {name}", "{name} के साथ सौदा"), { name: app.t(partner.short) })}</h1><StatusPill status={status} /></div>
      {app.story.scenario === "meetup-cancelled" ? <Notice tone="warn" title={app.t(L("Meetup cancelled", "أُلغي اللقاء", "मुलाकात रद्द"))}>{app.t(L("The terms stay locked. You can suggest another public time or close the trade.", "تبقى الشروط مثبتة. يمكن اقتراح موعد عام آخر أو إغلاق الصفقة.", "शर्तें लॉक रहती हैं। आप दूसरा सार्वजनिक समय सुझा सकते हैं या सौदा बंद कर सकते हैं।"))}</Notice> : null}
      {app.story.scenario === "disputed" ? <Notice tone="bad" title={app.t(L("Disputed", "قيد النزاع", "विवाद में"))}>{app.t(L("SwapFair does not promise a refund. There is no escrow in this version.", "لا تعد SwapFair باسترداد. لا يوجد ضمان دفع في هذه النسخة.", "SwapFair रिफंड का वादा नहीं करता। इस संस्करण में एस्क्रो नहीं है।"))}</Notice> : null}
      <div className="grid-2">
        <article className="card pad stack">
          <h2>{app.t(L("Agreed items", "الأغراض المتفق عليها", "सहमत वस्तुएँ"))}</h2>
          {version.your.map((item) => <div key={item.id} className="spread"><span>{app.t(item.title)}</span><span className="num">{money(item.value, currency, app.locale)}</span></div>)}
          {version.their.map((item) => <div key={item.id} className="spread"><span>{app.t(item.title)}</span><span className="num">{money(item.value, currency, app.locale)}</span></div>)}
          <div className="spread"><span>{app.t(L("Cash adjustment", "تعديل نقدي", "नकद समायोजन"))}</span><strong className="num">{money(version.yourCash - version.theirCash, currency, app.locale)}</strong></div>
          <Disclaimer />
          <p className="small">{app.t(L("Accepted version {n}", "النسخة المقبولة {n}", "स्वीकृत संस्करण {n}"), { n: version.n })} · {gapSentence(totals.yours, totals.theirs, currency, app.locale)}</p>
        </article>
        <article className="card pad stack">
          <h2>{app.t(L("Meetup", "اللقاء", "मुलाकात"))}</h2>
          <p>{app.story.meetup?.place ?? version.place}</p>
          <p>{app.story.meetup?.date ?? version.date}</p>
          <p className="muted small">{app.t(L("Home addresses are hidden.", "عناوين المنازل مخفية.", "घर के पते छिपे हैं।"))}</p>
          <div className="row wrap">
            <button className="btn btn-secondary btn-small" onClick={() => app.go("schedule")}>{app.t(L("Schedule", "حدد الموعد", "समय तय करें"))}</button>
            <button className="btn btn-secondary btn-small" onClick={() => app.go("checkin")}>{app.t(L("Check in", "تسجيل الوصول", "चेक-इन"))}</button>
            <button className="btn btn-secondary btn-small" onClick={() => app.go("thread")}>{app.t(L("Conversation", "المحادثة", "बातचीत"))}</button>
          </div>
        </article>
      </div>
      <article className="card pad stack">
        <h2>{app.t(L("Checklist", "قائمة التحقق", "जाँच सूची"))}</h2>
        <p>{app.t(L("Meet in public. Inspect before you confirm. Count the cash adjustment there, not beforehand in a transfer.", "التقيا في مكان عام. افحصا قبل التأكيد. عُدّا التعديل النقدي هناك، لا بتحويل مسبق.", "सार्वजनिक जगह मिलें। पुष्टि से पहले जाँचें। नकद समायोजन वहीं गिनें, पहले ट्रांसफ़र में नहीं।"))}</p>
      </article>
      <section className="stack">
        <h2>{app.t(L("Timeline", "الخط الزمني", "समयरेखा"))}</h2>
        <div className="timeline">{events.map((event) => <article key={event}><i /><div><p>{event}</p><div className="line" /></div></article>)}</div>
      </section>
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => app.go("complete")}>{app.t(L("Confirm the exchange", "أكّد التبادل", "अदला-बदली की पुष्टि करें"))}</button>
        <button className="btn btn-ghost" onClick={() => app.go("dispute")}>{app.t(L("Raise a dispute", "ارفع نزاعًا", "विवाद उठाएँ"))}</button>
        <button className="btn btn-ghost" onClick={() => { app.patch({ scenario: "meetup-cancelled" }); app.notify(app.t(L("Meetup cancelled", "أُلغي اللقاء", "मुलाकात रद्द"))); }}>{app.t(L("Cancel meetup", "إلغاء اللقاء", "मुलाकात रद्द करें"))}</button>
      </div>
    </div>
  );
}

export function Schedule() {
  const app = useApp();
  const [place, setPlace] = useState(app.story.meetup?.place ?? "Dubai Mall, near the waterfall, ground floor");
  const [date, setDate] = useState(app.story.meetup?.date ?? "Sat 1 Nov, 5:00 pm");
  const [method, setMethod] = useState<Handoff>(app.story.meetup?.method ?? "meetup");
  const [pays, setPays] = useState(app.t(L("No shipping. Cash is handed over in person.", "لا شحن. يُسلّم النقد شخصيًا.", "शिपिंग नहीं। नकद व्यक्तिगत रूप से दिया जाएगा।")));
  const places = app.country === "AE" ? ["Dubai Mall, near the waterfall", "Marina Walk, in front of Spinneys", "Reem Mall atrium, Abu Dhabi"] : ["100 Feet Road, outside a café", "Cubbon Park entrance"];
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Schedule the exchange", "حدد موعد التبادل", "अदला-बदली का समय"))}</h1>
      <Notice>{app.t(L("Share a precise meetup only after the offer is accepted. Home addresses stay off the map.", "شارك مكان اللقاء الدقيق بعد قبول العرض فقط. عناوين المنازل تبقى خارج الخريطة.", "सटीक मुलाकात ऑफ़र स्वीकार होने के बाद ही साझा करें। घर के पते नक्शे पर नहीं आते।"))}</Notice>
      <label className="field"><span>{app.t(L("Public place", "مكان عام", "सार्वजनिक जगह"))}</span>
        <select value={place} onChange={(e) => setPlace(e.target.value)}>{places.map((item) => <option key={item}>{item}</option>)}</select>
      </label>
      <label className="field"><span>{app.t(L("When", "الموعد", "कब"))}</span><input value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="field"><span>{app.t(L("Method", "الطريقة", "तरीका"))}</span>
        <select value={method} onChange={(e) => setMethod(e.target.value as Handoff)}>
          <option value="meetup">{app.t(handoffLabel("meetup"))}</option>
          <option value="pickup">{app.t(handoffLabel("pickup"))}</option>
          <option value="delivery">{app.t(handoffLabel("delivery"))}</option>
          <option value="shipping">{app.t(handoffLabel("shipping"))}</option>
        </select>
      </label>
      {method === "shipping" ? <label className="field"><span>{app.t(L("Who pays shipping", "من يدفع الشحن", "शिपिंग कौन देगा"))}</span><input value={pays} onChange={(e) => setPays(e.target.value)} /></label> : null}
      {method === "shipping" ? <Notice tone="warn">{app.t(L("SwapFair does not guarantee delivery unless a protected delivery service is added later. Do not ship hazardous or prohibited goods. UAE–India shipping is off.", "لا تضمن SwapFair التوصيل ما لم تُضف خدمة توصيل محمية لاحقًا. لا تشحن أغراضًا خطرة أو ممنوعة. الشحن بين الإمارات والهند متوقف.", "जब तक बाद में कोई सुरक्षित डिलीवरी सेवा न जुड़े, SwapFair डिलीवरी की गारंटी नहीं देता। खतरनाक या प्रतिबंधित सामान न भेजें। यूएई–भारत शिपिंग बंद है।"))}</Notice> : null}
      <button className="btn btn-primary" onClick={() => { app.patch({ meetup: { place, date, method, whoPays: pays, trustedName: app.story.meetup?.trustedName ?? "", trustedPhone: app.story.meetup?.trustedPhone ?? "" }, phase: "scheduled", scenario: app.story.scenario === "meetup-cancelled" ? null : app.story.scenario }); app.notify(app.t(L("Meetup saved", "حُفظ الموعد", "मुलाकात सहेजी गई"))); app.go("workspace"); }}>{app.t(L("Save meetup", "حفظ الموعد", "मुलाकात सहेजें"))}</button>
    </div>
  );
}

export function CheckIn() {
  const app = useApp();
  const [left, setLeft] = useState(45 * 60);
  const [name, setName] = useState(app.story.meetup?.trustedName ?? "Hessa");
  const [phone, setPhone] = useState(app.story.meetup?.trustedPhone ?? "");
  useEffect(() => {
    if (!app.story.checkedIn) return;
    const id = window.setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [app.story.checkedIn]);
  const minutes = String(Math.floor(left / 60)).padStart(2, "0");
  const seconds = String(left % 60).padStart(2, "0");
  const emergency = app.country === "IN" ? "112" : "999";
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Safety check-in", "تسجيل السلامة", "सुरक्षा चेक-इन"))}</h1>
      <p>{app.story.meetup?.place ?? app.t(L("Choose a public place first.", "اختر مكانًا عامًا أولًا.", "पहले एक सार्वजनिक जगह चुनें।"))}</p>
      <p className="amount num" aria-live="polite">{app.story.checkedIn ? `${minutes}:${seconds}` : "45:00"}</p>
      <ul className="stack">
        <li>{app.t(L("Meet where other people can see you.", "التقيا حيث يراكم الآخرون.", "वहाँ मिलें जहाँ दूसरे आपको देख सकें।"))}</li>
        <li>{app.t(L("Inspect the item before you tap confirm.", "افحص الغرض قبل الضغط على تأكيد.", "पुष्टि से पहले वस्तु जाँचें।"))}</li>
        <li>{app.t(L("Do not carry more cash than the adjustment.", "لا تحمل نقدًا أكثر من التعديل.", "समायोजन से अधिक नकद न ले जाएँ।"))}</li>
      </ul>
      <label className="field"><span>{app.t(L("Trusted contact", "شخص موثوق", "भरोसेमंद व्यक्ति"))}</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>{app.t(L("Their phone", "هاتفهم", "उनका फ़ोन"))}</span><input className="num" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      <button className="btn btn-secondary" onClick={() => app.notify(app.t(L("A summary was copied for {name}. It includes the public place and the trade, not your home.", "نُسخ ملخص لـ {name}. يتضمن المكان العام والصفقة، لا منزلك.", "{name} के लिए सार कॉपी हुआ। इसमें सार्वजनिक जगह और सौदा है, आपका घर नहीं।"), { name }))}>{app.t(L("Share trade details", "شارك تفاصيل الصفقة", "सौदे का विवरण साझा करें"))}</button>
      <a className="btn btn-danger" href={`tel:${emergency}`}>{app.t(L("Emergency {number}", "طوارئ {number}", "आपातकाल {number}"), { number: emergency })}</a>
      <p className="small muted">{app.t(L("If you are in immediate danger, contact local emergency services. SwapFair cannot dispatch help.", "إذا كنت في خطر مباشر فاتصل بالطوارئ المحلية. لا تستطيع SwapFair إرسال مساعدة.", "अगर आप तत्काल खतरे में हैं तो स्थानीय आपातकालीन सेवा को कॉल करें। SwapFair मदद नहीं भेज सकता।"))}</p>
      {!app.story.checkedIn ? <button className="btn btn-primary" onClick={() => app.patch({ checkedIn: true, phase: "checkedin", checkinEnds: Date.now() + 45 * 60 * 1000 })}>{app.t(L("I’ve arrived", "وصلت", "मैं पहुँच गया"))}</button> : <button className="btn btn-primary" onClick={() => app.go("complete")}>{app.t(L("Continue to confirmation", "إلى التأكيد", "पुष्टि पर जाएँ"))}</button>}
    </div>
  );
}

export function Complete() {
  const app = useApp();
  const [inspected, setInspected] = useState(false);
  const partner = personById(app.country === "AE" ? "rohan" : "priya");
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Confirm the exchange", "أكّد التبادل", "अदला-बदली की पुष्टि करें"))}</h1>
      <p>{app.t(L("Both people confirm separately. One confirmation does not complete the trade.", "يؤكد الطرفان كل على حدة. تأكيد واحد لا يُتم الصفقة.", "दोनों अलग-अलग पुष्टि करते हैं। एक पुष्टि से सौदा पूरा नहीं होता।"))}</p>
      <label className="check"><input type="checkbox" checked={inspected} onChange={(e) => setInspected(e.target.checked)} /><span>{app.t(L("I inspected the items and counted any cash adjustment.", "فحصت الأغراض وعددت أي تعديل نقدي.", "मैंने वस्तुएँ जाँचीं और नकद समायोजन गिना।"))}</span></label>
      <div className="grid-2">
        <article className="card pad stack"><h2>{app.t(L("You", "أنت", "आप"))}</h2><p>{app.story.meConfirmed ? app.t(L("Confirmed", "أكّدت", "पुष्टि हो गई")) : app.t(L("Waiting for you", "بانتظارك", "आपकी प्रतीक्षा"))}</p></article>
        <article className="card pad stack"><h2>{partner ? app.t(partner.short) : ""}</h2><p>{app.story.themConfirmed ? app.t(L("Confirmed", "أكّد", "पुष्टि हो गई")) : app.t(L("Waiting for them", "بانتظارهم", "उनकी प्रतीक्षा"))}</p></article>
      </div>
      <button className="btn btn-primary" disabled={!inspected || app.story.meConfirmed} onClick={app.confirmMine}>{app.t(L("I confirm completion", "أؤكد الإتمام", "मैं पूरा होने की पुष्टि करता हूँ"))}</button>
      <button className="btn btn-secondary" onClick={app.confirmTheirs}>{app.t(L("They confirm too", "هم يؤكدون أيضًا", "वे भी पुष्टि करें"))}</button>
      {app.story.meConfirmed && app.story.themConfirmed ? <button className="btn btn-primary" onClick={() => app.go("review")}>{app.t(L("Leave a review", "اكتب تقييمًا", "समीक्षा लिखें"))}</button> : null}
    </div>
  );
}

export function Review() {
  const app = useApp();
  const [scores, setScores] = useState({ accuracy: 5, communication: 5, reliability: 5, condition: 5, overall: 5 });
  const [text, setText] = useState(app.t(L("The camera matched the description. The meetup at Dubai Mall was straightforward.", "الكاميرا طابقت الوصف. اللقاء في دبي مول كان واضحًا.", "कैमरा विवरण से मेल खाता था। दुबई मॉल की मुलाकात सीधी थी।")));
  const fields = [
    ["accuracy", L("Listing accuracy", "دقة الإعلان", "लिस्टिंग की सटीकता")],
    ["communication", L("Communication", "التواصل", "संवाद")],
    ["reliability", L("Reliability", "الالتزام", "भरोसेमंदी")],
    ["condition", L("Item condition", "حالة الغرض", "वस्तु की हालत")],
    ["overall", L("Overall experience", "التجربة عمومًا", "कुल अनुभव")],
  ] as const;
  if (app.story.reviewDone) {
    return <div className="page narrow stack"><h1>{app.t(L("Review saved", "حُفظ التقييم", "समीक्षा सहेजी गई"))}</h1><Notice tone="good">{app.t(L("Reviews stay hidden until you both submit, or until 14 days pass. You cannot edit a review after it becomes visible.", "تبقى التقييمات مخفية حتى يرسلها الطرفان، أو بعد 14 يومًا. لا يمكن تعديل التقييم بعد ظهوره.", "समीक्षाएँ तब तक छिपी रहती हैं जब तक दोनों भेजें, या 14 दिन बीत जाएँ। दिखाई देने के बाद समीक्षा नहीं बदली जा सकती।"))}</Notice></div>;
  }
  return (
    <div className="page narrow stack">
      <h1>{app.t(L("Private review", "تقييم خاص", "निजी समीक्षा"))}</h1>
      <p className="muted">{app.t(L("Double-blind: Rohan will not see this until both reviews are in, or the window closes.", "تعمية مزدوجة: لن يرى روهان هذا حتى يصل التقييمان أو تُغلق المهلة.", "दोहरा अंधा: रोहन इसे तब तक नहीं देखेंगे जब तक दोनों समीक्षाएँ आ जाएँ, या समय समाप्त हो।"))}</p>
      {fields.map(([key, label]) => (
        <div key={key} className="stack">
          <span>{app.t(label)}</span>
          <div className="stars" role="radiogroup" aria-label={app.t(label)}>
            {[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= scores[key] ? "on" : ""} aria-checked={scores[key] === n} role="radio" onClick={() => setScores({ ...scores, [key]: n })}>{n}</button>)}
          </div>
        </div>
      ))}
      <label className="field"><span>{app.t(L("Note", "ملاحظة", "नोट"))}</span><textarea value={text} onChange={(e) => setText(e.target.value)} /></label>
      <button className="btn btn-primary" onClick={() => { app.patch({ reviewDone: true, phase: "reviewed" }); app.notify(app.t(L("Review submitted", "أُرسل التقييم", "समीक्षा भेजी गई"))); }}>{app.t(L("Submit review", "إرسال التقييم", "समीक्षा भेजें"))}</button>
    </div>
  );
}
