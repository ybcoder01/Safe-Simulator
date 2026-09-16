"use client";

import { useState, type FormEvent } from "react";

import { EvidenceFindings } from "@/components/shared/evidence-findings";
import type { ManualSimulationView } from "@/lib/api/manual-simulation";
import { explorerAddressUrl } from "@/lib/explorer-links";

interface ManualSimulationFormProps {
  readonly chainId: number;
  readonly safeAddress: string;
}

interface ApiResponse {
  readonly data?: ManualSimulationView;
  readonly error?: { readonly message?: string };
}

function shorten(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function addressLink(chainId: number, address: string) {
  const url = explorerAddressUrl(chainId, address);
  return url ? (
    <a href={url} rel="noreferrer" target="_blank">
      {shorten(address)} <span aria-hidden="true">↗</span>
    </a>
  ) : (
    <code>{shorten(address)}</code>
  );
}

function coverageLabel(value: string) {
  return value.replaceAll("-", " ");
}

export function ManualSimulationForm({
  chainId,
  safeAddress,
}: ManualSimulationFormProps) {
  const [to, setTo] = useState("");
  const [value, setValue] = useState("0");
  const [data, setData] = useState("0x");
  const [result, setResult] = useState<ManualSimulationView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `/api/v1/safes/${chainId}/${safeAddress}/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: to.trim(),
            value: value.trim(),
            data: data.trim(),
          }),
        },
      );
      const body = (await response.json()) as ApiResponse;
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Draft simulation failed.");
      }
      setResult(body.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Draft simulation is temporarily unavailable.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="simulation-form" onSubmit={submit}>
        <div className="simulation-field-grid">
          <label>
            Target contract
            <input
              autoComplete="off"
              onChange={(event) => setTo(event.target.value)}
              placeholder="0x…"
              required
              spellCheck={false}
              value={to}
            />
          </label>
          <label>
            Native value in wei
            <input
              inputMode="numeric"
              onChange={(event) => setValue(event.target.value)}
              pattern="[0-9]+"
              required
              value={value}
            />
          </label>
        </div>
        <label>
          Calldata
          <textarea
            aria-describedby="calldata-help"
            onChange={(event) => setData(event.target.value)}
            required
            rows={7}
            spellCheck={false}
            value={data}
          />
        </label>
        <p className="simulation-help" id="calldata-help">
          Paste even-length hexadecimal. Use <code>0x</code> for a plain native
          transfer. Maximum 32 KiB.
        </p>
        <button className="button" disabled={submitting} type="submit">
          {submitting ? "Running read-only preview…" : "Simulate draft call"}
        </button>
        {submitting ? (
          <p className="form-status" role="status">
            Reading the latest Safe state and tracing the target call…
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {result ? (
        <section className="simulation-result" aria-live="polite">
          <div className="simulation-result-heading">
            <div>
              <p className="eyebrow">Advisory result</p>
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
              <span>Target-call outcome</span>
              <strong>
                {result.execution.success ? "Succeeded" : "Reverted"}
              </strong>
            </div>
            <div>
              <span>Decoded action</span>
              <strong>{result.decoded?.method ?? "Raw calldata"}</strong>
            </div>
            <div>
              <span>Internal calls</span>
              <strong>{result.execution.internalCallCount}</strong>
            </div>
            <div>
              <span>Storage changes</span>
              <strong>{result.execution.storageChangeCount}</strong>
            </div>
          </div>

          <dl className="simulation-details">
            <div>
              <dt>Target</dt>
              <dd>
                {result.target.label ? (
                  <strong>{result.target.label}</strong>
                ) : null}
                {addressLink(chainId, result.request.to)}
              </dd>
            </div>
            <div>
              <dt>Source evidence</dt>
              <dd>
                {result.target.verified ? "Verified" : "Not verified"} ·{" "}
                {result.target.source}
              </dd>
            </div>
            <div>
              <dt>Analysis coverage</dt>
              <dd>{coverageLabel(result.verdict.coverage)}</dd>
            </div>
            <div>
              <dt>Block</dt>
              <dd>{result.execution.blockNumber ?? "Unavailable"}</dd>
            </div>
          </dl>

          {result.execution.error ? (
            <p className="simulation-revert" role="status">
              {result.execution.error}
            </p>
          ) : null}

          {result.approvals.length > 0 ? (
            <div className="simulation-section">
              <h3>Requested permissions</h3>
              {result.approvals.map((approval, index) => (
                <article
                  className="simulation-permission"
                  key={`${approval.method}-${index}`}
                >
                  <strong>{approval.method}</strong>
                  <span>
                    {approval.infinite
                      ? "Unlimited"
                      : (approval.amount ?? "Unknown amount")}
                  </span>
                  {approval.spender
                    ? addressLink(chainId, approval.spender)
                    : null}
                  {approval.newSpenderAtAnchor === true ? (
                    <em>New spender at latest state</em>
                  ) : null}
                  {approval.warning ? <p>{approval.warning}</p> : null}
                </article>
              ))}
            </div>
          ) : null}

          <div className="simulation-section">
            <h3>Evidence findings</h3>
            <EvidenceFindings findings={result.verdict.findings} />
          </div>

          <div className="simulation-limitations">
            <strong>Coverage boundary</strong>
            <p>
              This preview calls the target from the Safe address at latest
              state. It does not validate signatures, nonce ordering, Safe
              guards, or the complete execution wrapper. Re-run the full review
              after a Safe proposal exists.
            </p>
          </div>
        </section>
      ) : null}
    </>
  );
}
