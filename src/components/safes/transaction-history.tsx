"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  resolveAddressDisplay,
  type AddressBookView,
} from "@/lib/api/address-book";
import {
  groupTransactionViews,
  orderTransactionReviewQueue,
  analysisVerdictPresentation,
  transactionMatchesReviewFilter,
  transactionMatchesSearch,
  transactionLifecycleStatus,
  type TransactionReviewFilter,
  type TransactionReviewQueueFilter,
  type TransactionView,
} from "@/lib/api/safe-details";
import {
  loadReviewedTransactionHashes,
  reviewProgressKey,
} from "@/lib/review-progress";

interface TransactionHistoryProps {
  readonly address: string;
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly currentSafeNonce: string;
  readonly initialTransactions: readonly TransactionView[];
  readonly initialReviewFilter: TransactionReviewFilter;
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

const reviewFilterLabels: Readonly<Record<TransactionReviewFilter, string>> = {
  all: "All",
  attention: "Needs review",
  flagged: "Critical warning",
  unverified: "Needs verification",
  "pending-analysis": "Not checked yet",
};

function AnalysisBadge({
  analysis,
}: {
  readonly analysis: TransactionView["analysis"];
}) {
  if (!analysis) {
    return (
      <em
        className="analysis-verdict analysis-verdict-pending"
        title="No automated review has been saved for this transaction yet."
      >
        Not checked yet
      </em>
    );
  }

  const presentation = analysisVerdictPresentation(analysis.baselineVerdict);
  return (
    <em
      className={`analysis-verdict analysis-verdict-${analysis.baselineVerdict}`}
      title={presentation.description}
    >
      {presentation.label}
    </em>
  );
}

function TransactionSummary({
  addressBook,
  chainId,
  transaction,
}: {
  readonly addressBook: readonly AddressBookView[];
  readonly chainId: number;
  readonly transaction: TransactionView;
}) {
  const target = resolveAddressDisplay(chainId, transaction.to, addressBook);

  return (
    <>
      <span
        className={`tx-activity tx-activity-${transaction.activity.type}`}
        title={`Classified from ${transaction.activity.basis.replaceAll("-", " ")} evidence.`}
      >
        {transaction.activity.label}
      </span>
      <strong>
        Nonce {transaction.nonce} ·{" "}
        {transaction.summary ??
          (transaction.operation === "delegatecall"
            ? "Delegate call"
            : "Contract call")}
      </strong>
      <span className="transaction-target">
        To {target ? `${target.label} · ` : ""}
        {shorten(transaction.to)}
        {target ? (
          <em className={`address-trust address-trust-${target.trust}`}>
            {target.trust}
          </em>
        ) : null}
        <AnalysisBadge analysis={transaction.analysis} />
      </span>
    </>
  );
}

export function TransactionHistory({
  address,
  addressBook,
  chainId,
  currentSafeNonce,
  initialTransactions,
  initialReviewFilter,
  nextCursor: initialCursor,
  threshold,
}: TransactionHistoryProps) {
  const [transactions, setTransactions] =
    useState<readonly TransactionView[]>(initialTransactions);
  const [nextCursor, setNextCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reviewFilter, setReviewFilter] =
    useState<TransactionReviewFilter>(initialReviewFilter);
  const [reviewedHashes, setReviewedHashes] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [showReviewed, setShowReviewed] = useState(false);
  const basePath = `/safe/${chainId}/${address}`;
  const storageKey = reviewProgressKey(chainId, address);

  useEffect(() => {
    function refreshProgress() {
      setReviewedHashes(
        loadReviewedTransactionHashes(localStorage, storageKey),
      );
    }

    function refreshFromStorage(event: StorageEvent) {
      if (event.key === storageKey) refreshProgress();
    }

    refreshProgress();
    window.addEventListener("storage", refreshFromStorage);
    return () => {
      window.removeEventListener("storage", refreshFromStorage);
    };
  }, [storageKey]);

  function isReviewed(transaction: TransactionView) {
    return reviewedHashes.has(transaction.safeTxHash.toLowerCase());
  }

  const matchingTransactions = transactions.filter((transaction) => {
    const target = resolveAddressDisplay(chainId, transaction.to, addressBook);
    return (
      transactionMatchesReviewFilter(transaction, reviewFilter) &&
      transactionMatchesSearch(
        transaction,
        query,
        target?.label ?? null,
        currentSafeNonce,
      )
    );
  });
  const orderedTransactions =
    reviewFilter === "all"
      ? matchingTransactions
      : orderTransactionReviewQueue(
          matchingTransactions,
          reviewFilter as TransactionReviewQueueFilter,
        );
  const queueFilter =
    reviewFilter === "all"
      ? null
      : (reviewFilter as TransactionReviewQueueFilter);
  const reviewedMatchingTransactions = queueFilter
    ? orderedTransactions.filter(isReviewed)
    : [];
  const remainingTransactions = queueFilter
    ? orderedTransactions.filter((transaction) => !isReviewed(transaction))
    : orderedTransactions;
  const filteredTransactions =
    queueFilter && !showReviewed ? remainingTransactions : orderedTransactions;
  const grouped = groupTransactionViews(filteredTransactions, currentSafeNonce);
  const searching = query.trim().length > 0;
  const filtering = searching || reviewFilter !== "all";
  const reviewFilterCounts = Object.fromEntries(
    (Object.keys(reviewFilterLabels) as TransactionReviewFilter[]).map(
      (filter) => [
        filter,
        transactions.filter((transaction) =>
          transactionMatchesReviewFilter(transaction, filter),
        ).length,
      ],
    ),
  ) as Record<TransactionReviewFilter, number>;
  function transactionHref(transaction: TransactionView) {
    const path = `${basePath}/tx/${transaction.safeTxHash}`;
    return queueFilter ? `${path}?review=${queueFilter}` : path;
  }

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
      <section
        className="activity-search"
        id="transaction-review"
        aria-labelledby="activity-search-title"
      >
        <label htmlFor="activity-search">
          <span id="activity-search-title">Search loaded activity</span>
          <input
            autoComplete="off"
            id="activity-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Label, address, nonce, summary, or hash"
            spellCheck={false}
            type="search"
            value={query}
          />
        </label>
        <fieldset className="activity-review-filters">
          <legend>Review priority</legend>
          <div>
            {(Object.keys(reviewFilterLabels) as TransactionReviewFilter[]).map(
              (filter) => (
                <button
                  aria-pressed={reviewFilter === filter}
                  className={reviewFilter === filter ? "selected" : undefined}
                  key={filter}
                  onClick={() => {
                    setReviewFilter(filter);
                    setShowReviewed(false);
                  }}
                  type="button"
                >
                  {reviewFilterLabels[filter]}
                  <span>{reviewFilterCounts[filter]}</span>
                </button>
              ),
            )}
          </div>
        </fieldset>
        <div className="activity-search-summary">
          <p aria-live="polite">
            {queueFilter
              ? remainingTransactions.length +
                " remaining · " +
                reviewedMatchingTransactions.length +
                " reviewed locally · " +
                transactions.length +
                " loaded."
              : filtering
                ? `${filteredTransactions.length} of ${transactions.length} loaded transactions match the current filters.`
                : "Search stays in this browser and covers loaded transactions only."}
          </p>
          <div>
            {queueFilter && remainingTransactions[0] ? (
              <Link
                className="button button-small"
                href={transactionHref(remainingTransactions[0])}
              >
                {reviewedMatchingTransactions.length > 0
                  ? "Continue review"
                  : "Start review"}{" "}
                · {remainingTransactions.length}
              </Link>
            ) : null}
            {queueFilter &&
            remainingTransactions.length === 0 &&
            reviewedMatchingTransactions.length > 0 ? (
              <strong className="review-queue-complete">Queue complete</strong>
            ) : null}
            {queueFilter && reviewedMatchingTransactions.length > 0 ? (
              <button
                aria-pressed={showReviewed}
                onClick={() => setShowReviewed((current) => !current)}
                type="button"
              >
                {showReviewed ? "Hide reviewed" : "Show reviewed"}
              </button>
            ) : null}
            {filtering ? (
              <button
                onClick={() => {
                  setQuery("");
                  setReviewFilter("all");
                  setShowReviewed(false);
                }}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="pending-panel"
        aria-labelledby="pending-actions-title"
      >
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
            {filtering
              ? "No pending actions match the current filters."
              : "No pending Safe actions are present in the loaded activity."}
          </div>
        ) : (
          <div className="pending-list">
            {grouped.pending.map((transaction) => {
              const reported = transaction.confirmations.length;
              const progress = Math.min(reported, threshold);

              return (
                <Link
                  className={
                    "pending-action-card" +
                    (isReviewed(transaction) ? " review-completed" : "")
                  }
                  href={transactionHref(transaction)}
                  key={transaction.safeTxHash}
                >
                  <div className="pending-action-copy">
                    <span className="tx-status tx-pending">Pending</span>
                    <TransactionSummary
                      addressBook={addressBook}
                      chainId={chainId}
                      transaction={transaction}
                    />
                    {isReviewed(transaction) ? (
                      <em className="review-complete-badge">
                        Reviewed locally
                      </em>
                    ) : null}
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
            <h3>
              {filtering
                ? "No historical activity matches"
                : "No historical Safe transactions loaded"}
            </h3>
            <p>
              {filtering
                ? "Try another search or review-priority filter."
                : "Executed, failed, replaced, and superseded activity will appear here after synchronization."}
            </p>
          </div>
        ) : (
          <div className="history-list">
            {grouped.history.map((transaction) => {
              const lifecycleStatus = transactionLifecycleStatus(
                transaction,
                currentSafeNonce,
              );
              return (
                <Link
                  className={
                    "history-row" +
                    (isReviewed(transaction) ? " review-completed" : "")
                  }
                  href={transactionHref(transaction)}
                  key={transaction.safeTxHash}
                >
                  <span className={`tx-status tx-${lifecycleStatus}`}>
                    {lifecycleStatus}
                  </span>
                  <div>
                    <TransactionSummary
                      addressBook={addressBook}
                      chainId={chainId}
                      transaction={transaction}
                    />
                    {isReviewed(transaction) ? (
                      <em className="review-complete-badge">
                        Reviewed locally
                      </em>
                    ) : null}
                    <span>
                      {lifecycleStatus === "superseded"
                        ? `Nonce ${transaction.nonce} was already consumed · `
                        : ""}
                      {transaction.confirmations.length}/{threshold}{" "}
                      confirmations reported
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
    </>
  );
}
