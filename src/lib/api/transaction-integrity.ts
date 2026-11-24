import { hashTypedData, zeroAddress } from "viem";

import type { Hex, SafeExecutionPayload, SafeTransaction } from "@/core/domain";

const safeTransactionTypes = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type SafeTransactionHashVerification =
  | {
      readonly status: "verified";
      readonly suppliedHash: Hex;
      readonly computedHash: Hex;
    }
  | {
      readonly status: "mismatch";
      readonly suppliedHash: Hex;
      readonly computedHash: Hex;
    }
  | {
      readonly status: "unavailable";
      readonly suppliedHash: Hex;
      readonly computedHash: null;
    };

/**
 * Recomputes the hash that Safe owners sign from the complete queue payload.
 * The Safe contracts currently supported by this product use this EIP-712
 * domain and SafeTx schema.
 */
export function computeSafeTransactionHash(payload: SafeExecutionPayload): Hex {
  return hashTypedData({
    domain: {
      chainId: payload.safe.chainId,
      verifyingContract: payload.safe.address,
    },
    types: safeTransactionTypes,
    primaryType: "SafeTx",
    message: {
      to: payload.to,
      value: payload.value,
      data: payload.data,
      operation: payload.operation === "delegatecall" ? 1 : 0,
      safeTxGas: payload.safeTxGas,
      baseGas: payload.baseGas,
      gasPrice: payload.gasPrice,
      gasToken: payload.gasToken ?? zeroAddress,
      refundReceiver: payload.refundReceiver ?? zeroAddress,
      nonce: payload.nonce,
    },
  });
}

export function verifySafeTransactionHash(
  payload: SafeExecutionPayload | null,
  suppliedHash: Hex,
): SafeTransactionHashVerification {
  if (!payload) {
    return { status: "unavailable", suppliedHash, computedHash: null };
  }

  const computedHash = computeSafeTransactionHash(payload);
  return {
    status:
      computedHash.toLowerCase() === suppliedHash.toLowerCase()
        ? "verified"
        : "mismatch",
    suppliedHash,
    computedHash,
  };
}

export interface CompetingProposalDifference {
  readonly field: "target" | "value" | "calldata" | "operation";
  readonly label: string;
  readonly current: string;
  readonly competing: string;
}

export interface CompetingProposal {
  readonly safeTxHash: Hex;
  readonly status: SafeTransaction["status"];
  readonly proposedAt: number;
  readonly differences: readonly CompetingProposalDifference[];
}

function difference(
  field: CompetingProposalDifference["field"],
  label: string,
  current: string,
  competing: string,
): CompetingProposalDifference | null {
  return current.toLowerCase() === competing.toLowerCase()
    ? null
    : { field, label, current, competing };
}

export function findCompetingProposals(
  current: SafeTransaction,
  candidates: readonly SafeTransaction[],
): readonly CompetingProposal[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.nonce === current.nonce &&
        candidate.safeTxHash.toLowerCase() !== current.safeTxHash.toLowerCase(),
    )
    .map((candidate) => ({
      safeTxHash: candidate.safeTxHash,
      status: candidate.status,
      proposedAt: candidate.proposedAt,
      differences: [
        difference("target", "Target", current.to, candidate.to),
        difference(
          "value",
          "Native value",
          current.value.toString(),
          candidate.value.toString(),
        ),
        difference("calldata", "Calldata", current.data, candidate.data),
        difference(
          "operation",
          "Operation",
          current.operation,
          candidate.operation,
        ),
      ].filter((item): item is CompetingProposalDifference => item !== null),
    }))
    .sort((left, right) => right.proposedAt - left.proposedAt);
}

export const TRANSACTION_REVIEW_FRESHNESS_SECONDS = 5 * 60;

export interface TransactionReviewFreshness {
  readonly status: "fresh" | "expired";
  readonly analyzedAt: number;
  readonly expiresAt: number;
}

export function transactionReviewFreshness(
  analyzedAt: number,
  now: number,
  freshnessSeconds = TRANSACTION_REVIEW_FRESHNESS_SECONDS,
): TransactionReviewFreshness {
  const expiresAt = analyzedAt + freshnessSeconds;
  return {
    status: now <= expiresAt ? "fresh" : "expired",
    analyzedAt,
    expiresAt,
  };
}
