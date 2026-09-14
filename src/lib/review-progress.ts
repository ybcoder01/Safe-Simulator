const REVIEW_PROGRESS_VERSION = 1;
const HASH_PATTERN = /^0x[0-9a-f]{64}$/;

interface ReviewProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredReviewProgress {
  readonly version: 1;
  readonly reviewed: readonly string[];
}

export interface ReviewProgressItem {
  readonly href: string;
  readonly safeTxHash: string;
}

export function resolveReviewQueueProgress(
  queue: readonly ReviewProgressItem[],
  currentSafeTxHash: string,
  reviewed: ReadonlySet<string>,
) {
  const normalizedCurrentHash = currentSafeTxHash.toLowerCase();
  const queueIndexByHash = new Map(
    queue.map((item, index) => [item.safeTxHash.toLowerCase(), index]),
  );
  const remaining = queue.filter(
    (item) => !reviewed.has(item.safeTxHash.toLowerCase()),
  );
  const currentQueueIndex = queueIndexByHash.get(normalizedCurrentHash) ?? -1;
  const remainingIndex = remaining.findIndex(
    (item) => item.safeTxHash.toLowerCase() === normalizedCurrentHash,
  );
  const nextAfterCurrent = remaining.find(
    (item) =>
      (queueIndexByHash.get(item.safeTxHash.toLowerCase()) ?? -1) >
      currentQueueIndex,
  );
  const nextAfterCompletion =
    nextAfterCurrent ??
    remaining.find(
      (item) => item.safeTxHash.toLowerCase() !== normalizedCurrentHash,
    ) ??
    null;

  return {
    completed: queue.length - remaining.length,
    currentReviewed: reviewed.has(normalizedCurrentHash),
    next:
      remainingIndex >= 0 && remainingIndex < remaining.length - 1
        ? remaining[remainingIndex + 1]
        : null,
    nextAfterCompletion,
    position: remainingIndex,
    previous: remainingIndex > 0 ? remaining[remainingIndex - 1] : null,
    remaining,
  };
}

export function reviewProgressKey(chainId: number, address: string): string {
  return `safe-inspector:review-progress:v${REVIEW_PROGRESS_VERSION}:${chainId}:${address.toLowerCase()}`;
}

export function loadReviewedTransactionHashes(
  storage: ReviewProgressStorage,
  key: string,
): ReadonlySet<string> {
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set();

    const parsed = JSON.parse(raw) as Partial<StoredReviewProgress>;
    if (
      parsed.version !== REVIEW_PROGRESS_VERSION ||
      !Array.isArray(parsed.reviewed)
    ) {
      return new Set();
    }

    return new Set(
      parsed.reviewed.filter(
        (hash): hash is string =>
          typeof hash === "string" && HASH_PATTERN.test(hash),
      ),
    );
  } catch {
    return new Set();
  }
}

export function updateTransactionReviewProgress(
  storage: ReviewProgressStorage,
  key: string,
  safeTxHash: string,
  completed: boolean,
): {
  readonly reviewed: ReadonlySet<string>;
  readonly stored: boolean;
} {
  const normalizedHash = safeTxHash.toLowerCase();
  const reviewed = new Set(loadReviewedTransactionHashes(storage, key));

  if (completed) reviewed.add(normalizedHash);
  else reviewed.delete(normalizedHash);

  try {
    const value: StoredReviewProgress = {
      version: REVIEW_PROGRESS_VERSION,
      reviewed: [...reviewed].sort(),
    };
    storage.setItem(key, JSON.stringify(value));
    return { reviewed, stored: true };
  } catch {
    return { reviewed, stored: false };
  }
}
