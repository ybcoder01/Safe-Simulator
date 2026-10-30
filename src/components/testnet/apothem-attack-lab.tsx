"use client";

import { useState } from "react";

import type { ApothemInspection } from "@/lib/testnet/apothem";

interface InspectResponse {
  readonly data?: ApothemInspection;
  readonly error?: { readonly message?: string };
}

export function ApothemAttackLabInspector() {
  const [transactionHash, setTransactionHash] = useState("");
  const [inspection, setInspection] = useState<ApothemInspection | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function inspect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setInspection(null);
    try {
      const response = await fetch("/api/v1/testnet/apothem/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionHash }),
      });
      const body = (await response.json().catch(() => ({}))) as InspectResponse;
      if (!response.ok || !body.data) {
        throw new Error(
          body.error?.message ??
            "The Apothem transaction could not be inspected.",
        );
      }
      setInspection(body.data);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Apothem transaction could not be inspected.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section
        className="telegram-alerts-card"
        aria-labelledby="apothem-inspector-title"
      >
        <div className="telegram-alerts-heading">
          <div>
            <p className="eyebrow">Real chain evidence · Test assets only</p>
            <h2 id="apothem-inspector-title">Inspect an Apothem transaction</h2>
            <p>
              Paste a transaction hash broadcast on chain 51. Safe Inspector
              reads fixed Apothem RPC endpoints; it never follows a URL supplied
              by the browser.
            </p>
          </div>
          <span className="telegram-alert-state state-paused">
            XDC Apothem · 51
          </span>
        </div>

        <form className="stack" onSubmit={inspect}>
          <label className="field">
            <span>Apothem transaction hash</span>
            <input
              autoComplete="off"
              inputMode="text"
              onChange={(event) =>
                setTransactionHash(event.target.value.trim())
              }
              pattern="^0x[0-9a-fA-F]{64}$"
              placeholder="0x…"
              required
              spellCheck={false}
              type="text"
              value={transactionHash}
            />
          </label>
          <div className="telegram-alert-controls">
            <button className="button" disabled={pending} type="submit">
              {pending ? "Reading Apothem…" : "Inspect transaction"}
            </button>
            <a
              className="button-link"
              href="https://testnet.xdcscan.com"
              rel="noreferrer"
              target="_blank"
            >
              Open testnet explorer
            </a>
          </div>
        </form>

        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {inspection ? (
        <section className="attack-scenario-body" aria-live="polite">
          <header className="transaction-title attack-transaction-title">
            <div>
              <p className="eyebrow">
                {inspection.network} · Block{" "}
                {inspection.blockNumber ?? "pending"}
              </p>
              <h2>
                {inspection.verdict === "stop"
                  ? "Stop. This test transaction needs attention"
                  : "Review this test transaction"}
              </h2>
            </div>
            <div className="transaction-title-labels">
              <span className="tx-activity">Real testnet transaction</span>
              <span
                className={
                  inspection.verdict === "stop"
                    ? "tx-status tx-failed"
                    : "tx-status tx-pending"
                }
              >
                {inspection.verdict === "stop" ? "Critical" : "Review"}
              </span>
            </div>
          </header>

          <div className="telegram-alert-grid">
            <article>
              <span>Effective target</span>
              <strong>{inspection.effectiveCall.target}</strong>
            </article>
            <article>
              <span>Operation</span>
              <strong>{inspection.effectiveCall.operation}</strong>
            </article>
            <article>
              <span>Native value</span>
              <strong>{inspection.effectiveCall.valueTxdc} TXDC</strong>
            </article>
          </div>

          <div className="attack-list">
            {inspection.findings.map((finding) => (
              <article
                className={
                  finding.severity === "critical"
                    ? "telegram-health-error"
                    : "malicious-demo-notice"
                }
                key={finding.code}
              >
                <strong>
                  {finding.severity === "critical"
                    ? "Critical · "
                    : "Review · "}
                  {finding.title}
                </strong>
                <p>{finding.explanation}</p>
              </article>
            ))}
          </div>

          <p className="telegram-alerts-note">
            This verdict applies only to the supplied testnet transaction and
            visible evidence. It does not clear the signer, interface, protocol,
            or any production transaction.
          </p>
          <a
            className="button button-secondary"
            href={inspection.explorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            Verify on XDCScan Testnet
          </a>
        </section>
      ) : null}
    </>
  );
}
