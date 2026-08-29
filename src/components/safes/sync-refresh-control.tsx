"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  initialRefreshSyncState,
  type RefreshSyncAction,
} from "@/lib/api/sync-refresh";

interface SyncRefreshControlProps {
  readonly action: RefreshSyncAction;
  readonly disabled: boolean;
}

export function SyncRefreshControl({
  action,
  disabled,
}: SyncRefreshControlProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    action,
    initialRefreshSyncState,
  );
  const queued = state.status === "queued";

  useEffect(() => {
    if (!queued) return;

    const refreshes = [3_000, 8_000, 15_000].map((delay) =>
      window.setTimeout(() => router.refresh(), delay),
    );
    return () => {
      refreshes.forEach((timer) => window.clearTimeout(timer));
    };
  }, [queued, state.requestedAt, router]);

  const statusId = "sync-refresh-status";
  return (
    <form action={formAction} className="sync-refresh-form">
      <button
        aria-describedby={state.message ? statusId : undefined}
        className="sync-refresh-button"
        disabled={disabled || pending || queued}
        type="submit"
      >
        {pending
          ? "Queueing refresh…"
          : queued
            ? "Refresh queued"
            : disabled
              ? "Sync in progress"
              : "Refresh data"}
      </button>
      {state.message ? (
        <p
          className={state.status === "error" ? "form-error" : undefined}
          id={statusId}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
