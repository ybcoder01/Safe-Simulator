"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  hasRefreshRequestSettled,
  initialRefreshSyncState,
  type RefreshSyncAction,
  type SyncRefreshStatus,
} from "@/lib/api/sync-refresh";

interface SyncRefreshControlProps {
  readonly action: RefreshSyncAction;
  readonly disabled: boolean;
  readonly syncStatus: SyncRefreshStatus;
}

export function SyncRefreshControl({
  action,
  disabled,
  syncStatus,
}: SyncRefreshControlProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    action,
    initialRefreshSyncState,
  );
  const observedRequestAt = useRef<number | null>(null);
  const actionAccepted =
    state.status === "queued" || state.status === "running";

  useEffect(() => {
    if (actionAccepted && disabled) {
      observedRequestAt.current = state.requestedAt;
    }
  }, [actionAccepted, disabled, state.requestedAt]);

  const settled = hasRefreshRequestSettled(
    state.status,
    state.requestedAt,
    observedRequestAt.current,
    syncStatus,
  );
  const checking = actionAccepted && !settled;
  const message = settled ? null : state.message;

  useEffect(() => {
    if (!checking) return;

    const refreshes = [3_000, 8_000, 15_000].map((delay) =>
      window.setTimeout(() => router.refresh(), delay),
    );
    return () => {
      refreshes.forEach((timer) => window.clearTimeout(timer));
    };
  }, [checking, state.requestedAt, router]);

  const statusId = "sync-refresh-status";
  return (
    <form action={formAction} className="sync-refresh-form">
      <button
        aria-describedby={message ? statusId : undefined}
        className="sync-refresh-button"
        disabled={disabled || pending || checking}
        type="submit"
      >
        {pending
          ? "Queueing refresh…"
          : checking
            ? state.status === "queued"
              ? "Refresh queued"
              : "Sync in progress"
            : disabled
              ? "Sync in progress"
              : "Refresh data"}
      </button>
      {message ? (
        <p
          className={state.status === "error" ? "form-error" : undefined}
          id={statusId}
          role={state.status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
