import { getAddress, hashTypedData, isAddress, isHex, zeroAddress } from "viem";

import type { GatewayTransactionDetails } from "@safe-global/safe-apps-sdk";

import type {
  Address,
  Hex,
  SafeExecutionPayload,
  SafeTransaction,
} from "@/core/domain";

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

/**
 * Normalizes the Safe Apps gateway response into the exact EIP-712 payload
 * needed for independent hash verification. Missing or malformed fields fail
 * closed instead of being replaced with guessed values.
 */
export function executionPayloadFromSafeAppsDetails(
  details: GatewayTransactionDetails,
  chainId: number,
): SafeExecutionPayload | null {
  const execution = details.detailedExecutionInfo;
  const transaction = details.txData;
  if (
    !transaction ||
    !execution ||
    !("safeTxHash" in execution) ||
    !isAddress(details.safeAddress) ||
    !isAddress(transaction.to.value) ||
    !isHex(execution.safeTxHash) ||
    !isAddress(execution.gasToken) ||
    !execution.refundReceiver ||
    !isAddress(execution.refundReceiver.value)
  ) {
    return null;
  }

  const data = transaction.hexData ?? "0x";
  if (!isHex(data)) return null;

  try {
    return {
      safe: {
        chainId,
        address: getAddress(details.safeAddress) as Address,
      },
      safeTxHash: execution.safeTxHash as Hex,
      nonce: BigInt(execution.nonce),
      to: getAddress(transaction.to.value) as Address,
      value: BigInt(transaction.value ?? "0"),
      data: data as Hex,
      operation: transaction.operation === 1 ? "delegatecall" : "call",
      safeTxGas: BigInt(execution.safeTxGas),
      baseGas: BigInt(execution.baseGas),
      gasPrice: BigInt(execution.gasPrice),
      gasToken: getAddress(execution.gasToken) as Address,
      refundReceiver: getAddress(execution.refundReceiver.value) as Address,
      confirmations: [],
    };
  } catch {
    return null;
  }
}

export interface ReviewedTransactionIntent {
  readonly safe: Address;
  readonly to: Address;
  readonly value: string;
  readonly data: Hex;
  readonly operation: "call" | "delegatecall";
}

/** Confirms that the proposal Safe created is the exact intent Inspector reviewed. */
export function executionPayloadMatchesReviewedIntent(
  payload: SafeExecutionPayload,
  intent: ReviewedTransactionIntent,
): boolean {
  return (
    payload.safe.address.toLowerCase() === intent.safe.toLowerCase() &&
    payload.to.toLowerCase() === intent.to.toLowerCase() &&
    payload.value === BigInt(intent.value) &&
    payload.data.toLowerCase() === intent.data.toLowerCase() &&
    payload.operation === intent.operation
  );
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
