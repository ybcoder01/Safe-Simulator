"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { unreadCount } from "@/lib/logic";
import { Icon } from "./ui";
import { useApp } from "./store";

const ITEMS = [
  { href: "/discover", label: "Discover", icon: "discover" as const },
  { href: "/map", label: "Map", icon: "map" as const },
  { href: "/create", label: "Create", icon: "plus" as const },
  { href: "/messages", label: "Messages", icon: "chat" as const },
  { href: "/profile", label: "Profile", icon: "person" as const },
];

export function useViewer() {
  const app = useApp();
  const me = app.state.users.find((user) => user.id === app.state.sessionUserId) ?? null;
  const pref = me ? (app.state.preferences.find((item) => item.userId === me.id) ?? null) : null;
  return { ...app, me, pref };
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { state, api, me, pref } = useViewer();
  const bare = path === "/" || path.startsWith("/onboarding") || path.endsWith("/live");
  const unread = me ? unreadCount(state, me.id) : 0;
  const notices = me ? state.notices.filter((notice) => notice.userId === me.id && !notice.read).length : 0;

  const pathRef = useRef(path);
  useEffect(() => {
    if (pathRef.current === path) return;
    pathRef.current = path;
    api.clearToast();
  }, [path, api]);

  useEffect(() => {
    if (!state.toast) return;
    const id = window.setTimeout(() => api.clearToast(), 4200);
    return () => window.clearTimeout(id);
  }, [state.toast, api]);

  useEffect(() => {
    if (bare) return;
    if (!me) router.replace("/");
    else if (!pref?.guidelinesAcceptedAt) router.replace("/onboarding");
  }, [bare, me, pref, router]);

  if (bare) {
    return (
      <>
        {children}
        <Toast />
      </>
    );
  }

  if (!me || !pref?.guidelinesAcceptedAt) return null;

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl md:grid md:grid-cols-[15rem_1fr]">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-cream focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line/80 px-4 py-6 md:flex">
        <Link href="/discover" className="font-display text-3xl">
          Gatherly
        </Link>
        <p className="mt-1 text-sm text-muted">Dubai · small plans</p>
        <nav aria-label="Primary" className="mt-8 grid gap-1">
          {ITEMS.map((item) => {
            const active = path === item.href || path.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold ${active ? "bg-navy text-white" : "text-ink hover:bg-cream"}`}>
                <Icon name={item.icon} />
                {item.label}
                {item.href === "/messages" && unread > 0 ? <span className="ml-auto rounded-full bg-coral px-2 py-0.5 text-xs text-white">{unread}</span> : null}
              </Link>
            );
          })}
        </nav>
        <Link href="/notifications" className="mt-auto flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold">
          <Icon name="bell" />
          Notices
          {notices > 0 ? <span className="ml-auto rounded-full bg-coral px-2 py-0.5 text-xs text-white">{notices}</span> : null}
        </Link>
      </aside>
      <div className="min-w-0 pb-24 md:pb-10">
        <div id="content">{children}</div>
      </div>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {ITEMS.map((item) => {
            const active = path === item.href || (item.href !== "/discover" && path.startsWith(item.href));
            const create = item.href === "/create";
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-coral-deep" : "text-muted"}`}>
                  <span className={create ? "-mt-5 grid h-12 w-12 place-items-center rounded-full bg-coral text-white shadow-lg" : ""}>
                    <Icon name={item.icon} />
                  </span>
                  {item.label}
                  {item.href === "/messages" && unread > 0 ? <span className="sr-only">{unread} unread conversations</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Toast />
    </div>
  );
}

function Toast() {
  const { state } = useApp();
  if (!state.toast) return null;
  const tone = state.toast.tone === "error" ? "bg-navy" : state.toast.tone === "good" ? "bg-teal" : "bg-ink";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4" role="status">
      <p className={`max-w-md rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg ${tone}`}>{state.toast.message}</p>
    </div>
  );
}
