"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  loadReviewedTransactionHashes,
  resolveReviewQueueProgress,
  reviewProgressKey,
  type ReviewProgressItem,
  updateTransactionReviewProgress,
} from "@/lib/review-progress";

interface ReviewQueueProgressProps {
  readonly address: string;
  readonly chainId: number;
  readonly currentSafeTxHash: string;
  readonly overviewHref: string;
  readonly queue: readonly ReviewProgressItem[];
}

export function ReviewQueueProgress({
  address,
  chainId,
  currentSafeTxHash,
  overviewHref,
  queue,
}: ReviewQueueProgressProps) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const normalizedCurrentHash = currentSafeTxHash.toLowerCase();
  const storageKey = reviewProgressKey(chainId, address);

  useEffect(() => {
    function refreshProgress() {
      setReviewed(loadReviewedTransactionHashes(localStorage, storageKey));
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

  const queueState = useMemo(
    () => resolveReviewQueueProgress(queue, normalizedCurrentHash, reviewed),
    [normalizedCurrentHash, queue, reviewed],
  );

  function updateCurrent(completed: boolean) {
    const result = updateTransactionReviewProgress(
      localStorage,
      storageKey,
      normalizedCurrentHash,
      completed,
    );
    setReviewed(result.reviewed);
    setStorageError(
      result.stored
        ? null
        : "Review progress could not be saved in this browser.",
    );
    return result.stored;
  }

  function completeAndContinue() {
    if (updateCurrent(true)) {
      router.push(queueState.nextAfterCompletion?.href ?? overviewHref);
    }
  }

  return (
    <nav className="review-queue-nav" aria-label="Transaction review queue">
      <div className="review-queue-copy">
        <p className="eyebrow">Review queue</p>
        {queueState.currentReviewed ? (
          <strong>Reviewed in this browser</strong>
        ) : (
          <strong>
            {queueState.position + 1} of {queueState.remaining.length} remaining
          </strong>
        )}
        <span>{queueState.completed} completed · highest priority first</span>
      </div>
      <div className="review-queue-actions">
        {queueState.currentReviewed ? (
          <button
            className="button button-small button-secondary"
            onClick={() => updateCurrent(false)}
            type="button"
          >
            Reopen review
          </button>
        ) : (
          <button
            className="button button-small review-complete-action"
            onClick={completeAndContinue}
            type="button"
          >
            {queueState.nextAfterCompletion
              ? "Mark reviewed & open next"
              : "Mark reviewed & finish queue"}
          </button>
        )}
        {queueState.previous ? (
          <Link
            className="button button-small button-secondary"
            href={queueState.previous.href}
          >
            ← Previous
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="button button-small button-secondary disabled"
          >
            ← Previous
          </span>
        )}
        {queueState.next ? (
          <Link className="button button-small" href={queueState.next.href}>
            Next →
          </Link>
        ) : (
          <span aria-disabled="true" className="button button-small disabled">
            Next →
          </span>
        )}
      </div>
      {storageError ? (
        <p className="review-progress-error" role="alert">
          {storageError}
        </p>
      ) : null}
    </nav>
  );
}
