"use client";

import { useActionState } from "react";

import {
  initialReanalysisRequestState,
  type ReanalysisRequestAction,
} from "@/lib/api/reanalysis-request";

interface ReanalysisControlProps {
  readonly action: ReanalysisRequestAction;
}

export function ReanalysisControl({ action }: ReanalysisControlProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialReanalysisRequestState,
  );
  const queued = state.status === "queued";
  const statusId = "reanalysis-request-status";

  return (
    <form action={formAction} className="sync-refresh-form">
      <button
        aria-describedby={state.message ? statusId : undefined}
        className="sync-refresh-button"
        disabled={pending || queued}
        type="submit"
      >
        {pending
          ? "Queueing analysis…"
          : queued
            ? "Analysis queued"
            : "Reanalyze history"}
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
