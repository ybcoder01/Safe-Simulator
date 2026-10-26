"use client";

import { useEffect, type ReactNode } from "react";
import type { Energy, User } from "@/lib/types";

export function Portrait({
  user,
  size = 44,
}: {
  user: Pick<User, "name" | "avatarHue" | "portrait" | "identityVerified">;
  size?: number;
}) {
  const hue = user.avatarHue;
  const skin = `hsl(${(hue + 20) % 360} 42% 78%)`;
  const hair = `hsl(${hue} 32% 28%)`;
  const cloth = `hsl(${(hue + 28) % 360} 46% 46%)`;
  const variant = user.portrait % 8;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 80 80" width={size} height={size} role="img" aria-label={user.name}>
        <circle cx="40" cy="40" r="40" fill={`hsl(${hue} 48% 90%)`} />
        <path d="M14 78c4-16 14-24 26-24s22 8 26 24" fill={cloth} />
        <circle cx="40" cy="36" r="16" fill={skin} />
        {variant === 2 ? (
          <path d="M18 34c2-16 12-24 22-24s20 8 22 24c-6 6-12 8-22 8s-16-2-22-8z" fill={hair} />
        ) : null}
        {variant === 0 ? <path d="M24 30c2-12 8-16 16-16s14 5 16 16c-8-4-24-4-32 0z" fill={hair} /> : null}
        {variant === 1 ? <path d="M22 34c0-16 8-24 18-24s18 8 18 22c2 14-2 26-8 32-4-10-8-14-10-14s-6 4-10 16c-6-8-8-20-8-32z" fill={hair} /> : null}
        {variant === 3 ? (
          <>
            <circle cx="28" cy="28" r="7" fill={hair} />
            <circle cx="40" cy="22" r="7" fill={hair} />
            <circle cx="52" cy="28" r="7" fill={hair} />
          </>
        ) : null}
        {variant === 5 ? (
          <>
            <path d="M24 34c2-12 8-18 16-18s14 6 16 18c-8-5-24-5-32 0z" fill={hair} />
            <circle cx="40" cy="16" r="6" fill={hair} />
          </>
        ) : null}
        {variant === 6 ? (
          <>
            <path d="M24 32c2-12 8-16 16-16s14 4 16 16c-8-4-24-4-32 0z" fill={hair} />
            <path d="M30 44c2 8 6 12 10 12s8-4 10-12c-6 3-14 3-20 0z" fill={hair} />
          </>
        ) : null}
        {variant === 7 ? <path d="M20 38c1-18 8-26 20-26s19 8 20 24c-4 10-10 16-20 16s-16-4-20-14z" fill={hair} /> : null}
        {variant === 4 ? (
          <>
            <path d="M25 30c2-10 7-14 15-14s13 4 15 14c-8-4-22-4-30 0z" fill={hair} />
            <circle cx="33" cy="38" r="5" fill="none" stroke="#1a2744" strokeWidth="1.6" />
            <circle cx="47" cy="38" r="5" fill="none" stroke="#1a2744" strokeWidth="1.6" />
            <path d="M38 38h4" stroke="#1a2744" strokeWidth="1.6" />
          </>
        ) : null}
        <circle cx="34" cy="37" r="1.3" fill="#1a2744" />
        <circle cx="46" cy="37" r="1.3" fill="#1a2744" />
        <path d="M35 44c2 2 8 2 10 0" stroke="#9a5a48" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      </svg>
      {user.identityVerified ? (
        <span className="absolute -right-0.5 -bottom-0.5 grid h-4 w-4 place-items-center rounded-full bg-teal text-[10px] text-white" title="Identity verified">
          <span className="sr-only">Identity verified</span>✓
        </span>
      ) : null}
    </span>
  );
}

export function Stack({ users, size = 28 }: { users: User[]; size?: number }) {
  const shown = users.slice(0, 4);
  const extra = users.length - shown.length;
  return (
    <span className="inline-flex items-center">
      {shown.map((user, index) => (
        <span key={user.id} className="-ml-2 rounded-full ring-2 ring-cream first:ml-0" style={{ zIndex: 4 - index }}>
          <Portrait user={user} size={size} />
        </span>
      ))}
      {extra > 0 ? <span className="ml-1 text-xs font-semibold text-muted">+{extra}</span> : null}
    </span>
  );
}

export function EnergyPill({ energy }: { energy: Energy }) {
  const tone =
    energy === "Relaxed" ? "bg-[#e5f3ea] text-[#1d6844]" : energy === "Lively" ? "bg-[#fff0dc] text-[#9a4e10]" : "bg-[#e6eef8] text-[#1d3f68]";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{energy}</span>;
}

export function Cover({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    // Activity photography is local and sometimes replaced by an upload preview.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />
  );
}

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button className="absolute inset-0 bg-navy/45" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-auto rounded-t-[1.8rem] bg-cream p-5 shadow-2xl md:inset-auto md:top-1/2 md:left-1/2 md:w-[32rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[1.8rem]"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id="sheet-title" className="font-display text-2xl text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-semibold text-muted">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-line bg-white px-3 py-3 text-base text-ink outline-none placeholder:text-muted/80";

export function EmptyArt({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.6rem] border border-dashed border-line bg-cream px-5 py-8 text-center">
      <svg viewBox="0 0 120 70" className="mx-auto mb-3 h-16 w-28" aria-hidden>
        <rect x="8" y="18" width="46" height="36" rx="12" fill="#f6d7c4" />
        <rect x="40" y="10" width="52" height="40" rx="14" fill="#1a2744" />
        <circle cx="58" cy="28" r="4" fill="#f3eee6" />
        <circle cx="74" cy="28" r="4" fill="#e15d32" />
        <path d="M54 40c4 4 16 4 22 0" stroke="#f3eee6" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <h3 className="font-display text-2xl">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">{body}</p>
    </div>
  );
}

export function Splash() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="text-center">
        <p className="font-display text-4xl text-ink">Gatherly</p>
        <p className="mt-2 text-sm text-muted">Find your people by doing something together.</p>
      </div>
    </div>
  );
}

export function Icon({ name }: { name: "discover" | "map" | "plus" | "chat" | "person" | "bell" | "shield" | "back" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      {name === "discover" ? <circle cx="12" cy="12" r="8" {...common} /> : null}
      {name === "discover" ? <path d="m14.5 9.5-1.2 4-4 1.2 1.2-4z" {...common} /> : null}
      {name === "map" ? <path d="M4 6.5 9 5l6 2 5-1.5V18l-5 1.5-6-2L4 19Z" {...common} /> : null}
      {name === "plus" ? <path d="M12 6v12M6 12h12" {...common} /> : null}
      {name === "chat" ? <path d="M6 16.5 4 20l4.2-1.4A8 8 0 1 0 6 16.5Z" {...common} /> : null}
      {name === "person" ? <path d="M12 12a3.2 3.2 0 1 0-3.2-3.2A3.2 3.2 0 0 0 12 12Zm-6 7.2a6 6 0 0 1 12 0" {...common} /> : null}
      {name === "bell" ? <path d="M6 16h12l-1.2-2.2a6 6 0 0 1-.8-3V10a4 4 0 0 0-8 0v.8a6 6 0 0 1-.8 3Z" {...common} /> : null}
      {name === "shield" ? <path d="M12 3.5 19 6v5.2c0 4.2-2.8 7.2-7 8.8-4.2-1.6-7-4.6-7-8.8V6Z" {...common} /> : null}
      {name === "back" ? <path d="M15 5 8 12l7 7" {...common} /> : null}
    </svg>
  );
}
