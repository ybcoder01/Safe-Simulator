import { getAddress } from "viem";
import { z } from "zod";

import type { Address, AddressBookReview, SafeSnapshot } from "@/core/domain";

export const importSafeInputSchema = z.object({
  chainId: z
    .number()
    .int()
    .refine((value) => value === 1 || value === 50, "Unsupported chain."),
  address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 20-byte EVM address.")
    .transform((value) => getAddress(value)),
});

export const discoverSafesInputSchema = z.object({
  chainId: z.coerce
    .number()
    .int()
    .refine((value) => value === 1 || value === 50, "Unsupported chain."),
  owner: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/, "Enter a 20-byte EVM address.")
    .transform((value) => getAddress(value).toLowerCase() as Address),
});

export interface SafeView {
  readonly chainId: number;
  readonly address: string;
  readonly owners: readonly string[];
  readonly threshold: number;
  readonly nonce: string;
  readonly version: string | null;
  readonly guard: string | null;
  readonly modules: readonly string[];
  readonly implementation: string | null;
  readonly observedAt: number;
  readonly syncStatus: "queued" | "syncing" | "complete" | "failed";
  readonly bookmarked: boolean;
  readonly pendingTrustReviews: number;
  readonly actionableTrustReviews: number;
}

export interface PendingTrustReviewSummary {
  readonly pending: number;
  readonly actionable: number;
}

export function summarizePendingTrustReviews(
  reviews: readonly AddressBookReview[],
): PendingTrustReviewSummary {
  const pendingReviews = reviews.filter(
    (review) => review.status === "pending",
  );
  return {
    pending: pendingReviews.length,
    actionable: pendingReviews.filter(
      (review) => review.currentUserDecision === null,
    ).length,
  };
}

export function toSafeView(
  safe: SafeSnapshot,
  syncStatus: SafeView["syncStatus"] = "queued",
  options: {
    readonly bookmarked?: boolean;
    readonly pendingTrustReviews?: number;
    readonly actionableTrustReviews?: number;
  } = {},
): SafeView {
  return {
    ...safe,
    nonce: safe.nonce.toString(),
    syncStatus,
    bookmarked: options.bookmarked ?? true,
    pendingTrustReviews: options.pendingTrustReviews ?? 0,
    actionableTrustReviews: options.actionableTrustReviews ?? 0,
  };
}

interface SafeIdentity {
  readonly chainId: number;
  readonly address: string;
}

export function withoutSafe<T extends SafeIdentity>(
  items: readonly T[],
  target: SafeIdentity,
): readonly T[] {
  const address = target.address.toLowerCase();
  return items.filter(
    (item) =>
      item.chainId !== target.chainId || item.address.toLowerCase() !== address,
  );
}
