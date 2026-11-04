"use client";

import SafeAppsSDK from "@safe-global/safe-apps-sdk";
import { parseUnits } from "viem";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { EvidenceFindings } from "@/components/shared/evidence-findings";
import type { ManualSimulationView } from "@/lib/api/manual-simulation";

interface SafeContext {
  readonly address: string;
  readonly chainId: number;
  readonly owners: readonly string[];
  readonly threshold: number;
}

interface ApiResponse {
  readonly data?: ManualSimulationView;
  readonly error?: { readonly message?: string };
}

const SAFE_CONTEXT_TIMEOUT_MS = 8_000;

function shorten(value: string) {
  return value.length > 20
    ? `${value.slice(0, 10)}…${value.slice(-8)}`
    : value;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(
        () => reject(new Error("Safe did not provide an account context.")),
        timeoutMs,
      );
    }),
  ]);
}

function nativeSymbol(chainId: number) {
  return chainId === 1 ? "ETH" : chainId === 50 ? "XDC" : "native token";
}

export function SafeAppReview() {
  const sdkRef = useRef<SafeAppsSDK | null>(null);
  const [safe, setSafe] = useState<SafeContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [nativeValue, setNativeValue] = useState("0");
  const [data, setData] = useState("0x");
  const [result, setResult] = useState<ManualSimulationView | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposalHash, setProposalHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const sdk = new SafeAppsSDK();
    sdkRef.current = sdk;

    void withTimeout(sdk.safe.getInfo(), SAFE_CONTEXT_TIMEOUT_MS)
      .then((info) => {
        if (!active) return;
        setSafe({
          address: info.safeAddress,
          chainId: Number(info.chainId),
          owners: info.owners,
          threshold: info.threshold,
        });
      })
      .catch((cause) => {
        if (!active) return;
        setContextError(
          cause instanceof Error
            ? cause.message
            : "Open this Preview URL as a Custom App inside Safe Global.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  function invalidateReview() {
    setResult(null);
    setAcknowledged(false);
    setProposalHash(null);
    setError(null);
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!safe) return;

    setReviewing(true);
    setResult(null);
    setAcknowledged(false);
    setProposalHash(null);
    setError(null);

    try {
      const value = parseUnits(nativeValue.trim() || "0", 18).toString();
      const response = await fetch("/api/v1/safe-app/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId: safe.chainId,
          safeAddress: safe.address,
          to: to.trim(),
          value,
          data: data.trim(),
        }),
      });
      const body = (await response.json()) as ApiResponse;
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "The draft review failed.");
      }
      setResult(body.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The draft review is temporarily unavailable.",
      );
    } finally {
      setReviewing(false);
    }
  }

  async function propose() {
    if (!result || !sdkRef.current || result.verdict.verdict === "flagged") {
      return;
    }
    if (result.verdict.verdict === "unverified" && !acknowledged) {
      setError("Acknowledge the unresolved checks before continuing to Safe.");
      return;
    }

    setProposing(true);
    setError(null);
    try {
      const response = await sdkRef.current.txs.send({
        txs: [
          {
            to: result.request.to,
            value: result.request.value,
            data: result.request.data,
          },
        ],
      });
      setProposalHash(response.safeTxHash);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Safe did not open the transaction confirmation.",
      );
    } finally {
      setProposing(false);
    }
  }

  if (contextError) {
    return (
      <section className="safe-app-state" role="alert">
        <p className="eyebrow">Safe context unavailable</p>
        <h1>Open this page inside Safe Global</h1>
        <p>{contextError}</p>
        <p>
          In Safe, choose Apps → My custom apps → Add custom Safe App, then
          paste this Preview URL.
        </p>
      </section>
    );
  }

  if (!safe) {
    return (
      <section className="safe-app-state" role="status">
        <p className="eyebrow">Connecting securely</p>
        <h1>Reading the selected Safe…</h1>
      </section>
    );
  }

  const blocked = result?.verdict.verdict === "flagged";
  const needsAcknowledgement = result?.verdict.verdict === "unverified";

  return (
    <div className="safe-app-layout">
      <section className="safe-app-context" aria-label="Selected Safe">
        <div>
          <span>Selected Safe</span>
          <strong>{shorten(safe.address)}</strong>
        </div>
        <div>
          <span>Network</span>
          <strong>{safe.chainId === 50 ? "XDC Network" : `Chain ${safe.chainId}`}</strong>
        </div>
        <div>
          <span>Signing policy</span>
          <strong>
            {safe.threshold} of {safe.owners.length}
          </strong>
        </div>
      </section>

      <section className="safe-app-intro">
        <p className="eyebrow">Before the first signature</p>
        <h1>Review and propose</h1>
        <p>
          Paste the exact transaction created by your treasury workflow. Safe
          Inspector reviews it first; Safe opens its normal confirmation only
          after this review.
        </p>
      </section>

      <form className="safe-app-form" onSubmit={review}>
        <label>
          Target address
          <input
            autoComplete="off"
            onChange={(event) => {
              setTo(event.target.value);
              invalidateReview();
            }}
            placeholder="0x…"
            required
            spellCheck={false}
            value={to}
          />
        </label>
        <label>
          Native value ({nativeSymbol(safe.chainId)})
          <input
            inputMode="decimal"
            onChange={(event) => {
              setNativeValue(event.target.value);
              invalidateReview();
            }}
            placeholder="0"
            required
            value={nativeValue}
          />
        </label>
        <label>
          Calldata
          <textarea
            onChange={(event) => {
              setData(event.target.value);
              invalidateReview();
            }}
            required
            rows={6}
            spellCheck={false}
            value={data}
          />
        </label>
        <button className="button" disabled={reviewing} type="submit">
          {reviewing ? "Running security review…" : "Review transaction"}
        </button>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="safe-app-result" aria-live="polite">
          <div className="safe-app-result-heading">
            <div>
              <p className="eyebrow">Deterministic review</p>
              <h2>{result.verdict.headline}</h2>
            </div>
            <span
              className={`analysis-verdict analysis-verdict-${result.verdict.verdict}`}
            >
              {result.verdict.verdict}
            </span>
          </div>

          <div className="simulation-metrics">
            <div>
              <span>Target</span>
              <strong>{result.target.label ?? shorten(result.request.to)}</strong>
            </div>
            <div>
              <span>Action</span>
              <strong>{result.decoded?.method ?? "Raw calldata"}</strong>
            </div>
            <div>
              <span>Internal calls</span>
              <strong>{result.execution.internalCallCount}</strong>
            </div>
            <div>
              <span>Delegate calls</span>
              <strong>{result.execution.delegateCallCount}</strong>
            </div>
          </div>

          <EvidenceFindings findings={result.verdict.findings} showAddresses />

          {blocked ? (
            <div className="safe-app-stop" role="alert">
              <strong>Do not propose this transaction.</strong>
              <p>
                Critical evidence must be resolved before Safe Inspector will
                hand this draft to Safe.
              </p>
            </div>
          ) : (
            <div className="safe-app-propose">
              {needsAcknowledgement ? (
                <label className="safe-app-acknowledgement">
                  <input
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    I reviewed the unresolved checks and independently confirmed
                    the intended target and recipients.
                  </span>
                </label>
              ) : null}
              <button
                className="button"
                disabled={
                  proposing || (needsAcknowledgement && !acknowledged)
                }
                onClick={propose}
                type="button"
              >
                {proposing
                  ? "Opening Safe confirmation…"
                  : "Continue to Safe confirmation"}
              </button>
              <p>
                Safe Inspector does not sign. Safe Global will show the final
                native confirmation and collect owner signatures.
              </p>
            </div>
          )}

          {proposalHash ? (
            <p className="form-status" role="status">
              Draft handed to Safe. Safe transaction:{" "}
              <code>{shorten(proposalHash)}</code>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
