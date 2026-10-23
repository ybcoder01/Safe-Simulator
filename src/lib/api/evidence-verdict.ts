import {
  evaluateEvidenceVerdict,
  type DecodeConfidence,
  type EvidenceVerdict,
  type EvidenceVerdictInput,
} from "@/core/analysis/trust/evidence-verdict";
import { successfulNativeTransfers } from "@/core/analysis/tokens/native-transfers";
import { contractRegistryEntriesForChain } from "@/core/analysis/trust/contract-registry";
import type {
  Address,
  AddressBookEntry,
  Hex,
  SafeTransaction,
} from "@/core/domain";
import type { ApprovalRiskResult } from "@/lib/api/approval-risk";
import type { ContractInsight } from "@/lib/api/contract-insight";
import type { ExecutionInsight } from "@/lib/api/execution-insight";
import type { InternalProxyBoundary } from "@/lib/api/internal-proxy-boundaries";
import type { ProtocolRouteAttestation } from "@/lib/api/protocol-route-attestation";
import type { StorageChangeAnalysis } from "@/lib/api/storage-changes";

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Address-book trust approves a Silo market only when the stored fingerprint
 * still matches the configuration proven for this transaction. A trusted
 * address with a missing or different fingerprint is stale, not approved.
 */
function siloMarketApproval(
  markets: readonly Address[],
  addressBook: readonly AddressBookEntry[],
  reviews: readonly { address: Address; fingerprint: string }[],
): "current" | "stale" | "unapproved" {
  const states = markets.map((market) => {
    const entry = addressBook.find(
      (item) => item.trust === "trusted" && sameAddress(item.address, market),
    );
    if (!entry) return "unapproved" as const;
    const review = reviews.find((item) => sameAddress(item.address, market));
    return entry.reviewFingerprint &&
      review &&
      entry.reviewFingerprint === review.fingerprint
      ? ("current" as const)
      : ("stale" as const);
  });
  if (states.every((state) => state === "current")) return "current";
  if (states.every((state) => state !== "unapproved")) return "stale";
  return "unapproved";
}

function decodeConfidence(
  provenance: ContractInsight["provenance"],
): DecodeConfidence {
  switch (provenance) {
    case "verified-abi":
      return "verified";
    case "safe-service":
      return "service";
    case "signature-database":
      return "signature";
    case "raw":
      return "raw";
  }
}

export function resolveEvidenceVerdict(
  transaction: SafeTransaction,
  contract: ContractInsight,
  execution: ExecutionInsight,
  addressBook: readonly AddressBookEntry[],
  approvalRisk: ApprovalRiskResult | null = null,
  storageAnalysis: StorageChangeAnalysis | null = null,
  targetRuntimeCodeHash: Hex | null = null,
  targetRuntimeCodeAnchor:
    | "transaction-block"
    | "latest"
    | "latest-fallback"
    | "unavailable" = "unavailable",
  internalProxyBoundaries: readonly InternalProxyBoundary[] = [],
  targetAccountType: "contract" | "wallet" | "unavailable" = "contract",
  routeAttestation: ProtocolRouteAttestation | null = null,
): EvidenceVerdict {
  const routeFindings = (routeAttestation?.findings ?? []).map((finding) => {
    if (finding.code !== "silo-permissionless-market") return finding;
    if (finding.addresses.length === 0) return finding;
    const approval = siloMarketApproval(
      finding.addresses,
      addressBook,
      routeAttestation?.marketReviews ?? [],
    );
    if (approval === "current") {
      return {
        ...finding,
        code: "silo-approved-market",
        severity: "info" as const,
        title: "This exact Silo market configuration is approved by your team",
        detail:
          "The route matches the official Silo Factory, and every market vault is trusted for this implementation and critical configuration.",
      };
    }
    if (approval === "stale") {
      return {
        ...finding,
        code: "silo-market-review-stale",
        severity: "warning" as const,
        title: "Approved Silo market configuration has changed",
        detail:
          "This market address is trusted, but its implementation, runtime code, assets, oracle, rate model, hook, or risk parameters no longer match the configuration your team approved. Approve the current configuration before relying on that trust record.",
      };
    }
    return finding;
  });
  const attestedBoundaries = routeAttestation?.proxyBoundaries ?? [];
  const mergedBoundaries = [
    ...new Map(
      [...internalProxyBoundaries, ...attestedBoundaries].map((boundary) => [
        `${boundary.proxy.toLowerCase()}:${boundary.implementation.toLowerCase()}`,
        boundary,
      ]),
    ).values(),
  ];
  const executedAllowances = approvalRisk
    ? approvalRisk.executedChanges.map((allowance) => ({
        token: allowance.token,
        owner: allowance.owner,
        spender: allowance.spender,
        amount: allowance.amount,
        infinite: allowance.infinite,
        newSpenderAtAnchor: allowance.newSpenderAtAnchor,
      }))
    : execution.allowanceChanges.map((allowance) => ({
        token: allowance.token as Address,
        owner: allowance.owner as Address,
        spender: allowance.spender as Address,
        amount: allowance.amount,
        infinite: allowance.infinite,
        newSpenderAtAnchor: null,
      }));
  const input = {
    chainId: transaction.safe.chainId,
    safeAddress: transaction.safe.address,
    operation: transaction.operation,
    target: transaction.to,
    targetVerified: contract.metadata.verified,
    targetRuntimeCodeHash,
    targetRuntimeCodeAnchor,
    targetAccountType,
    implementationChain: contract.implementationChain.map(
      (address) => address as Address,
    ),
    internalProxyBoundaries: mergedBoundaries,
    ...(routeAttestation
      ? {
          attestedAddresses: routeAttestation.addresses,
          additionalFindings: routeFindings,
        }
      : {}),
    decodeConfidence: decodeConfidence(contract.provenance),
    movements: execution.tokenMovements.map((movement) => ({
      token: movement.token as Address,
      from: movement.from as Address,
      to: movement.to as Address,
    })),
    allowances: executedAllowances,
    approvalRequests:
      approvalRisk?.requests.map((approval) => ({
        standard: approval.standard,
        token: approval.token,
        spender: approval.spender,
        amount: approval.amount,
        infinite: approval.infinite,
        newSpenderAtAnchor: approval.newSpenderAtAnchor,
      })) ?? [],
    internalCalls: execution.internalCalls.map((call) => ({
      depth: call.depth,
      from: call.from as Address,
      to: call.to as Address,
      operation: call.operation,
    })),
    nativeTransfers: successfulNativeTransfers(execution.internalCalls).map(
      (transfer) => ({
        from: transfer.from as Address,
        to: transfer.to as Address,
        amount: transfer.amount.toString(),
      }),
    ),
    storageChanges:
      storageAnalysis?.items.map((change) => ({
        address: change.address,
        recognized: change.status === "named",
      })) ?? [],
    safeConfigurationChanges: execution.safeConfigurationChanges,
    addressBook,
    registry: contractRegistryEntriesForChain(transaction.safe.chainId),
    callTrace: execution.coverage.callTrace,
    storageDiff: execution.coverage.storageDiff,
    tokenEvents: execution.coverage.tokenEvents,
    outcome: execution.coverage.outcome,
  } satisfies EvidenceVerdictInput;

  return evaluateEvidenceVerdict(input);
}
