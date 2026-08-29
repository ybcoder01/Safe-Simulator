"use client";

import Link from "next/link";
import { useState } from "react";

import {
  groupTransactionViews,
  type TransactionView,
} from "@/lib/api/safe-details";

interface TransactionHistoryProps {
  readonly address: string;
  readonly chainId: number;
  readonly initialTransactions: readonly TransactionView[];
  readonly nextCursor: string | null;
  readonly threshold: number;
}

function shorten(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1_000));
}

function TransactionSummary({
  transaction,
}: {
  readonly transaction: TransactionView;
}) {
  return (
    <>
      <strong>
        Nonce {transaction.nonce} ·{" "}
        {transaction.summary ??
          (transaction.operation === "delegatecall"
            ? "Delegate call"
            : "Contract call")}
      </strong>
      <span>To {shorten(transaction.to)}</span>
    </>
  );
}

export function TransactionHistory({
  address,
  chainId,
  initialTransactions,
  nextCursor: initialCursor,
  threshold,
}: TransactionHistoryProps) {
  const [transactions, setTransactions] =
    useState<readonly TransactionView[]>(initialTransactions);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const basePath = `/safe/${chainId}/${address}`;
  const grouped = groupTransactionViews(transactions);

  async function loadMore() {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({ cursor: nextCursor, limit: "25" });
      const response = await fetch(
        `/api/v1/safes/${chainId}/${address}/transactions?${query}`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as {
        readonly data?: readonly TransactionView[];
        readonly nextCursor?: string | null;
        readonly error?: { readonly message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? "Could not load transactions.");
      }

      setTransactions((current) => {
        const known = new Set(current.map((item) => item.safeTxHash));
        return [
          ...current,
          ...body.data!.filter((item) => !known.has(item.safeTxHash)),
        ];
      });
      setNextCursor(body.nextCursor ?? null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load transactions.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="pending-panel" aria-labelledby="pending-actions-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Awaiting execution</p>
            <h2 id="pending-actions-title">Pending actions</h2>
          </div>
          <span>
            {grouped.pending.length}
            {nextCursor ? "+" : ""} loaded
          </span>
        </div>

        {grouped.pending.length === 0 ? (
          <div className="pending-empty">
            No pending Safe actions are present in the loaded activity.
          </div>
        ) : (
          <div className="pending-list">
            {grouped.pending.map((transaction) => {
              const reported = transaction.confirmations.length;
              const progress = Math.min(reported, threshold);

              return (
                <Link
                  className="pending-action-card"
                  href={`${basePath}/tx/${transaction.safeTxHash}`}
                  key={transaction.safeTxHash}
                >
                  <div className="pending-action-copy">
                    <span className="tx-status tx-pending">Pending</span>
                    <TransactionSummary transaction={transaction} />
                    <time
                      dateTime={new Date(
                        transaction.proposedAt * 1_000,
                      ).toISOString()}
                    >
                      Proposed {formatDate(transaction.proposedAt)}
                    </time>
                  </div>
                  <div className="confirmation-progress">
                    <span>
                      {reported}/{threshold} confirmations reported
                    </span>
                    <progress
                      aria-label={`${reported} of ${threshold} confirmations reported`}
                      max={threshold}
                      value={progress}
                    />
                  </div>
                  <span aria-hidden="true">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="history-panel" aria-labelledby="history-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Activity</p>
            <h2 id="history-title">Transaction history</h2>
          </div>
          <span>
            {grouped.history.length}
            {nextCursor ? "+" : ""} loaded
          </span>
        </div>

        {grouped.history.length === 0 ? (
          <div className="history-empty">
            <div className="empty-icon" aria-hidden="true">
              ↔
            </div>
            <h3>No historical Safe transactions loaded</h3>
            <p>
              Executed, failed, and replaced activity will appear here after
              synchronization.
            </p>
          </div>
        ) : (
          <div className="history-list">
            {grouped.history.map((transaction) => (
              <Link
                className="history-row"
                href={`${basePath}/tx/${transaction.safeTxHash}`}
                key={transaction.safeTxHash}
              >
                <span className={`tx-status tx-${transaction.status}`}>
                  {transaction.status}
                </span>
                <div>
                  <TransactionSummary transaction={transaction} />
                  <span>
                    {transaction.confirmations.length}/{threshold} confirmations
                    reported
                  </span>
                </div>
                <time
                  dateTime={new Date(
                    transaction.proposedAt * 1_000,
                  ).toISOString()}
                >
                  {formatDate(transaction.proposedAt)}
                </time>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
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
    </>
  );
}
