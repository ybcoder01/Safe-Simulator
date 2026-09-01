"use client";

import { useState } from "react";

import {
  appendUniqueModuleTransactionViews,
  type ModuleTransactionView,
} from "@/lib/api/module-activity";
import { explorerTransactionUrl } from "@/lib/explorer-links";

interface ModuleActivityProps {
  readonly address: string;
  readonly chainId: number;
  readonly initialTransactions: readonly ModuleTransactionView[];
  readonly nextCursor: string | null;
}

function shorten(value: string, start = 10, end = 8) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function executedAtLabel(timestamp: number) {
  return new Date(timestamp * 1_000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export function ModuleActivity({
  address,
  chainId,
  initialTransactions,
  nextCursor: initialCursor,
}: ModuleActivityProps) {
  const [transactions, setTransactions] =
    useState<readonly ModuleTransactionView[]>(initialTransactions);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({ cursor: nextCursor, limit: "25" });
      const response = await fetch(
        `/api/v1/safes/${chainId}/${address}/module-transactions?${query}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        readonly data?: readonly ModuleTransactionView[];
        readonly nextCursor?: string | null;
        readonly error?: { readonly message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(
          body.error?.message ?? "Could not load module executions.",
        );
      }

      setTransactions((current) =>
        appendUniqueModuleTransactionViews(current, body.data ?? []),
      );
      setNextCursor(body.nextCursor ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load module executions.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="history-panel module-activity-panel"
      aria-labelledby="module-activity-title"
    >
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Privileged execution path</p>
          <h2 id="module-activity-title">Module executions</h2>
        </div>
        <span>
          {transactions.length}
          {nextCursor ? "+" : ""} loaded
        </span>
      </div>

      {transactions.length === 0 ? (
        <div className="history-empty">
          <div className="empty-icon" aria-hidden="true">
            ◇
          </div>
          <h3>No module executions imported</h3>
          <p>
            Transactions executed through enabled modules will appear here after
            synchronization. They do not use the normal multisig confirmation
            path.
          </p>
        </div>
      ) : (
        <div className="history-list">
          {transactions.map((transaction) => {
            const explorerUrl = explorerTransactionUrl(
              chainId,
              transaction.transactionHash,
            );

            return (
              <article
                className="history-row module-history-row"
                key={transaction.transactionHash}
              >
                <span className="tx-status tx-module">module</span>
                <div>
                  <strong>To {shorten(transaction.to)}</strong>
                  <span>
                    Via {shorten(transaction.module)} · {transaction.operation}{" "}
                    · value {transaction.value} wei
                  </span>
                </div>
                <span>Block {transaction.blockNumber}</span>
                <div className="module-execution-meta">
                  <time
                    dateTime={new Date(
                      transaction.executedAt * 1_000,
                    ).toISOString()}
                  >
                    {executedAtLabel(transaction.executedAt)}
                  </time>
                  {explorerUrl ? (
                    <a
                      className="explorer-link"
                      href={explorerUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View transaction <span aria-hidden="true">↗</span>
                    </a>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {nextCursor ? (
        <div className="history-actions">
          <button
            className="button button-small"
            disabled={loading}
            onClick={loadMore}
            type="button"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
