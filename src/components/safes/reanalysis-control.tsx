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
  readonly kind: "transactions" | "modules";
}

export function ReanalysisControl({
  action,
  coverage,
  kind,
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
  const isModuleHistory = kind === "modules";
  const statusId = `${kind}-reanalysis-request-status`;
  const coverageId = `${kind}-reanalysis-coverage-status`;

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

  const describedBy = state.message ? `${coverageId} ${statusId}` : coverageId;
  const heading = isModuleHistory
    ? "Module analysis coverage"
    : "Transaction analysis coverage";
  const emptyMessage = isModuleHistory
    ? "No module executions are available for analysis yet."
    : "No transactions are available for analysis yet.";
  const completeMessage = isModuleHistory
    ? "Every module execution has a baseline from the current module engine version."
    : "Every transaction has a baseline from the current engine version.";
  const incompleteMessage = `${percentage}% has a current baseline. Queue the remaining ${
    isModuleHistory ? "module" : "transaction"
  } history in bounded batches.`;

  return (
    <div className="analysis-coverage">
      <div className="analysis-coverage-heading">
        <span>{heading}</span>
        <strong>
          {coverage.analyzedTransactions} of {coverage.totalTransactions}
        </strong>
      </div>
      <progress aria-label={heading} max={100} value={percentage} />
      <p id={coverageId}>
        {coverage.totalTransactions === 0
          ? emptyMessage
          : complete
            ? completeMessage
            : incompleteMessage}
      </p>
      <form action={formAction} className="sync-refresh-form">
        <button
          aria-describedby={describedBy}
          className="sync-refresh-button"
          disabled={pending || queued || coverage.totalTransactions === 0}
          type="submit"
        >
          {pending
            ? isModuleHistory
              ? "Queueing module analysis…"
              : "Queueing transaction analysis…"
            : queued
              ? isModuleHistory
                ? "Module analysis queued"
                : "Transaction analysis queued"
              : complete
                ? isModuleHistory
                  ? "Reanalyze modules"
                  : "Reanalyze transactions"
                : isModuleHistory
                  ? "Analyze modules"
                  : "Analyze transactions"}
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
