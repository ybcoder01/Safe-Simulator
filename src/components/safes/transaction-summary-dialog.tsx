"use client";

import { useRef, useState } from "react";

interface SummaryContent {
  readonly headline: string;
  readonly plainLanguage: string;
  readonly stance: "avoid" | "manual-review" | "appears-consistent";
  readonly keyActions: readonly string[];
  readonly risks: readonly string[];
  readonly checksBeforeSigning: readonly string[];
  readonly limitations: readonly string[];
}

interface SummaryView {
  readonly id: string;
  readonly model: string;
  readonly summary: SummaryContent;
  readonly usage: {
    readonly promptTokens: number | null;
    readonly completionTokens: number | null;
    readonly totalTokens: number | null;
  } | null;
  readonly completedAt: number | null;
  readonly cached: boolean;
}

interface Props {
  readonly endpoint: string;
}

interface ResponseBody {
  readonly data?: SummaryView;
  readonly error?: { readonly message?: string };
}

const stanceLabel: Record<SummaryContent["stance"], string> = {
  avoid: "Avoid until resolved",
  "manual-review": "Manual review required",
  "appears-consistent": "Appears consistent with current evidence",
};

export function TransactionSummaryDialog({ endpoint }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState<SummaryView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const body = (await response.json()) as ResponseBody;
      if (!response.ok || !body.data?.summary) {
        throw new Error(
          body.error?.message ?? "The summary could not be generated.",
        );
      }
      setSummary(body.data);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The summary could not be generated.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="summary-open-button" onClick={open} type="button">
        AI summary
      </button>
      <dialog
        aria-labelledby="transaction-summary-title"
        className="summary-dialog"
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        ref={dialog}
      >
        <div className="summary-dialog-card">
          <div className="summary-dialog-heading">
            <div>
              <p className="eyebrow">Optional second opinion</p>
              <h2 id="transaction-summary-title">Transaction summary</h2>
            </div>
            <button
              aria-label="Close transaction summary"
              className="summary-close-button"
              onClick={close}
              type="button"
            >
              ×
            </button>
          </div>

          {summary ? (
            <div className="summary-result">
              <div
                className={`summary-stance summary-stance-${summary.summary.stance}`}
              >
                <span>AI view only</span>
                <strong>{stanceLabel[summary.summary.stance]}</strong>
              </div>
              <h3>{summary.summary.headline}</h3>
              <p>{summary.summary.plainLanguage}</p>

              <div className="summary-grid">
                <section>
                  <h4>What it does</h4>
                  {summary.summary.keyActions.length > 0 ? (
                    <ul>
                      {summary.summary.keyActions.map((item, index) => (
                        <li key={`action-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No clear action was established.</p>
                  )}
                </section>
                <section>
                  <h4>Risks to review</h4>
                  {summary.summary.risks.length > 0 ? (
                    <ul>
                      {summary.summary.risks.map((item, index) => (
                        <li key={`risk-${index}`}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No additional risk was identified by this summary.</p>
                  )}
                </section>
              </div>

              <section className="summary-checks">
                <h4>Before signing</h4>
                <ol>
                  {summary.summary.checksBeforeSigning.map((item, index) => (
                    <li key={`check-${index}`}>{item}</li>
                  ))}
                </ol>
              </section>

              {summary.summary.limitations.length > 0 ? (
                <section className="summary-limitations">
                  <h4>Limitations</h4>
                  <ul>
                    {summary.summary.limitations.map((item, index) => (
                      <li key={`limit-${index}`}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <p className="summary-meta">
                {summary.cached ? "Reused saved summary" : "New summary"} ·{" "}
                {summary.model}
                {summary.usage?.totalTokens !== null &&
                summary.usage?.totalTokens !== undefined
                  ? ` · ${summary.usage.totalTokens} tokens`
                  : ""}
                {summary.completedAt
                  ? ` · ${new Date(summary.completedAt * 1_000).toLocaleString()}`
                  : ""}
                {" · "}ID {summary.id}
              </p>
              <p className="summary-warning">
                This output is advisory and may be wrong. The deterministic
                evidence verdict and raw transaction data remain authoritative.
                This interface cannot sign or submit transactions.
              </p>
            </div>
          ) : (
            <div className="summary-consent">
              <h3>Review the data boundary</h3>
              <p>
                Generating a summary sends bounded public transaction, contract,
                simulation, approval, balance, and verification evidence to
                OpenRouter and a selected model provider. Safe signatures,
                browser-profile trust labels, and cookies are excluded.
              </p>
              <ul>
                <li>No signing or transaction submission is possible here.</li>
                <li>No summary changes the deterministic evidence verdict.</li>
                <li>
                  The request requires providers that deny training collection
                  and support zero data retention.
                </li>
              </ul>
              <button
                className="button"
                disabled={loading}
                onClick={() => void generate()}
                type="button"
              >
                {loading ? "Generating…" : "Generate summary"}
              </button>
            </div>
          )}

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
