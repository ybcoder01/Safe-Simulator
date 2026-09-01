"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  initialReanalysisRequestState,
  reanalysisCoveragePercent,
  type ReanalysisCoverage,
  type ReanalysisRequestAction,
} from "@/lib/api/reanalysis-request";

interface ReanalysisControlProps {
  readonly action: ReanalysisRequestAction;
  readonly coverage: ReanalysisCoverage;
}

export function ReanalysisControl({
  action,
  coverage,
}: ReanalysisControlProps) {
  const [state, formAction, pending] = useActionState(
    action,
    initialReanalysisRequestState,
  );
  const router = useRouter();
  const refreshAttempts = useRef(0);
  const queued = state.status === "queued";
  const complete =
    coverage.totalTransactions > 0 &&
    coverage.analyzedTransactions >= coverage.totalTransactions;
  const percentage = reanalysisCoveragePercent(coverage);
  const statusId = "reanalysis-request-status";
  const coverageId = "reanalysis-coverage-status";

  useEffect(() => {
    if (!queued || complete) {
      refreshAttempts.current = 0;
      return;
    }

    const interval = window.setInterval(() => {
      if (refreshAttempts.current >= 20) {
        window.clearInterval(interval);
        return;
      }

      refreshAttempts.current += 1;
      router.refresh();
    }, 15_000);

    return () => window.clearInterval(interval);
  }, [complete, queued, router]);

  const describedBy = state.message
    ? `${coverageId} ${statusId}`
    : coverageId;

  return (
    <div className="analysis-coverage">
      <div className="analysis-coverage-heading">
        <span>Analysis coverage</span>
        <strong>
          {coverage.analyzedTransactions} of {coverage.totalTransactions}
        </strong>
      </div>
      <progress
        aria-label="Current analysis coverage"
        max={100}
        value={percentage}
      />
      <p id={coverageId}>
        {coverage.totalTransactions === 0
          ? "No transactions are available for analysis yet."
          : complete
            ? "Every transaction has a baseline from the current engine version."
            : `${percentage}% has a current baseline. Queue the remaining history in bounded batches.`}
      </p>
      <form action={formAction} className="sync-refresh-form">
        <button
          aria-describedby={describedBy}
          className="sync-refresh-button"
          disabled={pending || queued || coverage.totalTransactions === 0}
          type="submit"
        >
          {pending
            ? "Queueing analysis…"
            : queued
              ? "Analysis queued"
              : complete
                ? "Reanalyze history"
                : "Analyze history"}
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
    </div>
  );
}
