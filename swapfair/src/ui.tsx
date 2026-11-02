import type { ReactNode } from "react";
import { ui } from "./copy";
import { categories, listingById, personById } from "./data";
import { Icon } from "./icons";
import { balanceKind, balanceLabel, explainMatch, gapSentence, money, statusLabel } from "./logic";
import { useApp } from "./state";
import type { Currency, Listing, Person, TradeStatus } from "./types";

const artIcon: Record<string, string> = {
  ipad: "image",
  kindle: "image",
  laptop: "image",
  camera: "camera",
  lens: "camera",
  strap: "camera",
  ps5: "grid",
  chair: "grid",
  service: "spark",
  sewing: "spark",
  vacuum: "shield",
  watch: "star",
  helmet: "shield",
  guitar: "spark",
  ceramic: "star",
};

export function Art({ kind, label }: { kind: string; label: string }) {
  return (
    <div className={`art art-${kind}`} role="img" aria-label={label}>
      <Icon name={artIcon[kind] ?? "camera"} size={42} />
    </div>
  );
}

export function Avatar({ person, large = false }: { person: Person; large?: boolean }) {
  const { t } = useApp();
  return <span className={`avatar tone-${person.tone} ${large ? "lg" : ""}`}>{t(person.initials)}</span>;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "good" | "warn" | "bad"; title?: string; children: ReactNode }) {
  return (
    <div className={`notice ${tone}`}>
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon = "spark", title, body, action }: { icon?: string; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card pad empty">
      <div className="mark"><Icon name={icon} /></div>
      <h3>{title}</h3>
      <p className="muted prose">{body}</p>
      {action}
    </div>
  );
}

export function Disclaimer() {
  const { t } = useApp();
  return <p className="muted small">{t(ui.disclaimer)}</p>;
}

export function PolicyNotice() {
  const { t } = useApp();
  return <Notice title={t(ui.policy)}>{t(ui.nonExhaustive)}</Notice>;
}

export function StatusPill({ status }: { status: TradeStatus }) {
  const { t } = useApp();
  const tone = status === "completed" || status === "accepted" || status === "scheduled" ? "good" : status === "cancelled" || status === "declined" || status === "disputed" ? "bad" : status === "countered" || status === "awaiting" ? "warn" : "info";
  return <span className={`pill ${tone}`}>{t(statusLabel(status))}</span>;
}

export function BalanceBar({
  yours,
  theirs,
  currency,
  accepted = false,
}: {
  yours: number;
  theirs: number;
  currency: Currency;
  accepted?: boolean;
}) {
  const { t, locale } = useApp();
  const kind = balanceKind(yours, theirs, currency, accepted);
  const tone = kind === "balanced" ? "good" : kind === "accepted" ? "info" : "warn";
  const total = Math.max(yours + theirs, 1);
  return (
    <div className="balance" aria-live="polite">
      <div className="sides">
        <div>
          <div className="muted small">{t(ui.yourSide)}</div>
          <div className="amount num">{money(yours, currency, locale)}</div>
        </div>
        <span className={`pill ${tone}`}>{t(balanceLabel(kind))}</span>
        <div>
          <div className="muted small">{t(ui.theirSide)}</div>
          <div className="amount num">{money(theirs, currency, locale)}</div>
        </div>
      </div>
      <div className="meter" aria-hidden="true">
        <i className="you" style={{ width: `${(yours / total) * 100}%` }} />
        <i className="them" style={{ width: `${(theirs / total) * 100}%` }} />
      </div>
      <p>{gapSentence(yours, theirs, currency, locale)}</p>
    </div>
  );
}

export function ListingCard({ listing, variant = "feature" }: { listing: Listing; variant?: "feature" | "compact" }) {
  const app = useApp();
  const owner = personById(listing.ownerId);
  const match = explainMatch(listing, app.story.have, app.story.want);
  const saved = app.story.favorites.includes(listing.id);
  const level = match.level === "strong" ? ui.strong : match.level === "good" ? ui.good : match.level === "possible" ? ui.possible : null;
  return (
    <article className="card listing-wrap">
      <div className={`listing ${variant}`}>
        <button className="art-button" onClick={() => app.openListing(listing.id)} aria-label={app.t(listing.title)}>
          <Art kind={listing.art} label={app.t(listing.title)} />
        </button>
        <div className="stack">
          <div className="spread">
            <button className="btn-ghost" onClick={() => app.openListing(listing.id)} style={{ textAlign: "start", padding: 0 }}>
              <h3>{app.t(listing.title)}</h3>
            </button>
            <button className="icon-btn" aria-pressed={saved} aria-label={saved ? app.t(ui.saved) : app.t(ui.save)} onClick={() => app.toggleFavorite(listing.id)}>
              <Icon name="heart" size={18} />
            </button>
          </div>
          <div className="row wrap">
            <strong className="num">{money(listing.value, listing.currency, app.locale)}</strong>
            <span className="muted small">{app.t(ui.estimate)}</span>
            {listing.negotiable ? <span className="pill">{app.t(ui.negotiable)}</span> : <span className="pill">{app.t(ui.fixed)}</span>}
          </div>
          <p className="muted small">
            {app.t(listing.condition)} · {listing.area} · {app.t(listing.posted)}
            {owner && owner.rating > 0 ? ` · ${owner.rating.toFixed(1)}` : ""}
          </p>
          <p className="small">{app.t(listing.wants)}</p>
          <div className="row wrap">
            {owner?.identity || (owner?.phone && owner.email) ? <span className="pill info">{app.t(ui.verified)}</span> : null}
            {listing.committed ? <span className="pill bad">{app.t({ en: "In another trade", ar: "في صفقة أخرى", hi: "किसी और सौदे में" })}</span> : null}
            {listing.cashOk ? <span className="pill">{app.t(ui.cashOk)}</span> : null}
            {listing.bundlesOk ? <span className="pill">{app.t(ui.bundlesOk)}</span> : null}
            {listing.open ? <span className="pill">{app.t(ui.openOffers)}</span> : null}
            {level && listing.ownerId !== app.meId ? <span className={`pill ${match.level === "possible" ? "warn" : "good"}`}>{app.t(level)}</span> : null}
          </div>
          {listing.ownerId !== app.meId && match.reasons.length > 0 ? (
            <p className="small">{match.reasons.slice(0, 2).map((reason) => app.t(reason)).join(" · ")}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function PersonRow({ id, onOpen = true }: { id: string; onOpen?: boolean }) {
  const app = useApp();
  const person = personById(id);
  if (!person) return null;
  return (
    <button className="spread" style={{ width: "100%", background: "none", border: 0, padding: 0, textAlign: "start" }} onClick={() => onOpen && app.openProfile(id)}>
      <span className="row">
        <Avatar person={person} />
        <span>
          <strong>{app.t(person.name)}</strong>
          <span className="muted small" style={{ display: "block" }}>{person.area}, {person.city}</span>
        </span>
      </span>
      <Icon name="chevron" />
    </button>
  );
}

export function Stars({ value, onChange, label }: { value: number; onChange?: (n: number) => void; label: string }) {
  return (
    <div className="stars" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= value ? "on" : ""} role="radio" aria-checked={value === n} onClick={() => onChange?.(n)} aria-label={`${n}`}>
          <Icon name="star" />
        </button>
      ))}
    </div>
  );
}

export function Sheet({ title, children }: { title: string; children: ReactNode }) {
  const { setSheet } = useApp();
  return (
    <div className="backdrop" onClick={() => setSheet(null)}>
      <div className="sheet stack" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="spread">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={() => setSheet(null)} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function categoryLabel(id: string, t: (c: { en: string; ar: string; hi: string }) => string) {
  return t(categories.find((category) => category.id === id)?.label ?? { en: id, ar: id, hi: id });
}

export function useListing(id: string) {
  return listingById(id);
}
