"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface SafeAppReportRedirectProps {
  readonly action: string;
  readonly chainId: number;
  readonly headline: string;
  readonly protocol: string;
  readonly safeAddress: string;
  readonly safeTxHash: string;
  readonly verdict: string;
}

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 60;

export function SafeAppReportRedirect({
  action,
  chainId,
  headline,
  protocol,
  safeAddress,
  safeTxHash,
  verdict,
}: SafeAppReportRedirectProps) {
  const [attempt, setAttempt] = useState(0);
  const [stopped, setStopped] = useState(false);

  const reportPath = `/safe/${chainId}/${safeAddress}/tx/${safeTxHash}`;
  const statusPath = `/api/v1/safe-app/report-status?${new URLSearchParams({
    chainId: String(chainId),
    address: safeAddress,
    safeTxHash,
  })}`;

  const restart = useCallback(() => {
    setAttempt(0);
    setStopped(false);
  }, []);

  useEffect(() => {
    if (stopped) return;

    let active = true;
    let timer: number | undefined;

    async function check() {
      try {
        const response = await fetch(statusPath, {
          cache: "no-store",
          credentials: "include",
        });
        if (!active) return;

        if (response.ok) {
          window.location.replace(reportPath);
          return;
        }

        if (response.status !== 404) {
          throw new Error("The report status is temporarily unavailable.");
        }
      } catch {
        // Keep polling through transient network and synchronization failures.
      }

      if (!active) return;
      setAttempt((current) => {
        const next = current + 1;
        if (next >= MAX_POLL_ATTEMPTS) {
          setStopped(true);
          return next;
        }
        timer = window.setTimeout(check, POLL_INTERVAL_MS);
        return next;
      });
    }

    void fetch(`/api/v1/safes/${chainId}/${safeAddress}/refresh`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {
      // Authenticated watchlists can accelerate sync; ordinary Safe App sessions
      // still complete through the normal background synchronization path.
    });
    void check();

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [chainId, reportPath, safeAddress, statusPath, stopped]);

  return (
    <section className="safe-app-state" role="status">
      <p className="eyebrow">Safe transaction received</p>
      <h1>{headline}</h1>
      <div className="simulation-metrics">
        <div>
          <span>Protocol</span>
          <strong>{protocol}</strong>
        </div>
        <div>
          <span>Action</span>
          <strong>{action}</strong>
        </div>
        <div>
          <span>Verdict</span>
          <strong>{verdict}</strong>
        </div>
      </div>
      <p>
        Safe Inspector is synchronizing the transaction activity. This page will
        become the full report automatically.
      </p>
      <p>
        Transaction: <code>{safeTxHash}</code>
      </p>
      {stopped ? (
        <>
          <p>
            Synchronization is taking longer than expected. You can retry the
            automatic check or open the report directly.
          </p>
          <div>
            <button className="button" onClick={restart} type="button">
              Check again
            </button>{" "}
            <Link className="button button-secondary" href={reportPath}>
              Open report
            </Link>
          </div>
        </>
      ) : (
        <p>Checking synchronized activity… ({attempt + 1})</p>
      )}
    </section>
  );
}
