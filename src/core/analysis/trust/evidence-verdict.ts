import type {
  Address,
  AddressBookEntry,
  Finding,
  Operation,
  Verdict,
} from "../../domain";
import type { ContractRegistryEntry } from "./contract-registry";

export type DecodeConfidence = "verified" | "service" | "signature" | "raw";
export type AddressRole =
  | "target"
  | "token"
  | "movement-sender"
  | "movement-recipient"
  | "approval-spender"
  | "internal-target";

export interface EvidenceVerdictInput {
  readonly operation: Operation;
  readonly target: Address;
  readonly targetVerified: boolean;
  readonly decodeConfidence: DecodeConfidence;
  readonly movements: readonly {
    readonly token: Address;
    readonly from: Address;
    readonly to: Address;
  }[];
  readonly allowances: readonly {
    readonly token: Address;
    readonly spender: Address;
    readonly amount: string;
    readonly infinite: boolean;
    readonly newSpenderAtAnchor?: boolean | null;
  }[];
  readonly approvalRequests?: readonly {
    readonly standard:
      | "erc20"
      | "permit2-allowance"
      | "permit2-signature-transfer";
    readonly token: Address | null;
    readonly spender: Address | null;
    readonly amount: string | null;
    readonly infinite: boolean | null;
    readonly newSpenderAtAnchor: boolean | null;
  }[];
  readonly internalCalls: readonly {
    readonly to: Address;
    readonly operation: Operation;
  }[];
  readonly addressBook: readonly AddressBookEntry[];
  readonly registry?: readonly ContractRegistryEntry[];
  readonly callTrace: "complete" | "partial" | "root-only" | "unavailable";
  readonly storageDiff: "complete" | "partial" | "unavailable";
  readonly tokenEvents: "standard-events" | "unavailable";
  readonly outcome: "on-chain-receipt" | "read-only-call" | "unavailable";
}

export interface AddressTrustAssessment {
  readonly address: Address;
  readonly label: string | null;
  readonly status: Verdict;
  readonly source: "profile" | "registry" | "verified-source" | "unresolved";
  readonly roles: readonly AddressRole[];
}

export interface EvidenceVerdict {
  readonly verdict: Verdict;
  readonly headline: string;
  readonly findings: readonly Finding[];
  readonly addresses: readonly AddressTrustAssessment[];
  readonly coverage:
    | "target-receipt-and-trace"
    | "target-and-receipt-only"
    | "target-call-and-trace"
    | "target-and-call-only"
    | "target-only";
  readonly trustBoundary: string;
}

function addressKey(address: Address): string {
  return address.toLowerCase();
}

function uniqueAddresses(addresses: readonly Address[]): readonly Address[] {
  return [...new Set(addresses.map(addressKey))] as Address[];
}

function assessAddresses(
  input: EvidenceVerdictInput,
): readonly AddressTrustAssessment[] {
  const roles = new Map<
    string,
    { address: Address; roles: Set<AddressRole> }
  >();
  const add = (address: Address, role: AddressRole) => {
    const key = addressKey(address);
    const current = roles.get(key) ?? {
      address,
      roles: new Set<AddressRole>(),
    };
    current.roles.add(role);
    roles.set(key, current);
  };

  add(input.target, "target");
  for (const movement of input.movements) {
    add(movement.token, "token");
    add(movement.from, "movement-sender");
    add(movement.to, "movement-recipient");
  }
  for (const allowance of input.allowances) {
    add(allowance.token, "token");
    add(allowance.spender, "approval-spender");
  }
  for (const approval of input.approvalRequests ?? []) {
    if (approval.token) add(approval.token, "token");
    if (approval.spender) add(approval.spender, "approval-spender");
  }
  for (const call of input.internalCalls) {
    add(call.to, "internal-target");
  }

  const registry = new Map<string, ContractRegistryEntry>();
  for (const entry of input.registry ?? []) {
    registry.set(addressKey(entry.address), entry);
  }

  const records = new Map<string, AddressBookEntry>();
  for (const record of input.addressBook) {
    const key = addressKey(record.address);
    const current = records.get(key);
    if (!current || record.trust === "flagged") records.set(key, record);
  }

  return [...roles.values()].map(({ address, roles: addressRoles }) => {
    const record = records.get(addressKey(address));
    const registryEntry = registry.get(addressKey(address));
    const isVerifiedTarget =
      addressRoles.has("target") &&
      addressKey(address) === addressKey(input.target) &&
      input.targetVerified;

    return {
      address,
      label: record?.label ?? registryEntry?.label ?? null,
      status:
        record?.trust ??
        (registryEntry || isVerifiedTarget ? "known" : "unverified"),
      source: record
        ? "profile"
        : registryEntry
          ? "registry"
          : isVerifiedTarget
            ? "verified-source"
            : "unresolved",
      roles: [...addressRoles],
    };
  });
}

export function evaluateEvidenceVerdict(
  input: EvidenceVerdictInput,
): EvidenceVerdict {
  const findings: Finding[] = [];
  const addresses = assessAddresses(input);

  if (input.operation === "delegatecall") {
    findings.push({
      code: "delegatecall-operation",
      severity: "critical",
      title: "Delegate call executes with the Safe's storage context",
      detail:
        "The target code can modify Safe-owned storage. Full internal behavior requires a trace-capable provider.",
      addresses: [input.target],
    });
  }

  const internalDelegatecalls = input.internalCalls.filter(
    (call) => call.operation === "delegatecall",
  );
  if (internalDelegatecalls.length > 0) {
    findings.push({
      code: "internal-delegatecall",
      severity: "critical",
      title: "An internal delegate call was traced",
      detail:
        "The traced target code executed in its caller's storage context. Critical evidence is preserved regardless of address labels.",
      addresses: uniqueAddresses(internalDelegatecalls.map((call) => call.to)),
    });
  }

  for (const allowance of input.allowances.filter((item) => item.infinite)) {
    findings.push({
      code: "infinite-allowance",
      severity: "critical",
      title: "Infinite token allowance emitted",
      detail: `Token ${allowance.token} emitted a maximum-value allowance for spender ${allowance.spender}.`,
      addresses: [allowance.token, allowance.spender],
    });
  }

  const approvalRequests = input.approvalRequests ?? [];
  for (const approval of approvalRequests.filter(
    (item) =>
      item.infinite === true && item.standard !== "permit2-signature-transfer",
  )) {
    const involved = [approval.token, approval.spender].filter(
      (address): address is Address => address !== null,
    );
    findings.push({
      code: "requested-infinite-allowance",
      severity: "critical",
      title: "Calldata requests an infinite token allowance",
      detail:
        approval.standard === "permit2-allowance"
          ? "The transaction requests a maximum Permit2 allowance. Calldata proves the request; receipt evidence separately proves any emitted change."
          : "The transaction requests a maximum ERC-20 allowance. Calldata proves the request; receipt evidence separately proves any emitted change.",
      addresses: uniqueAddresses(involved),
    });
  }

  const maximumPermit2Transfers = approvalRequests.filter(
    (item) =>
      item.standard === "permit2-signature-transfer" && item.infinite === true,
  );
  if (maximumPermit2Transfers.length > 0) {
    findings.push({
      code: "maximum-permit2-signature-transfer",
      severity: "critical",
      title: "Permit2 signature transfer has a maximum amount",
      detail:
        "The signed Permit2 transfer authorizes a maximum-value amount. This is nonce-bound rather than a persistent allowance, but still requires explicit review.",
      addresses: uniqueAddresses(
        maximumPermit2Transfers
          .map((item) => item.token)
          .filter((address): address is Address => address !== null),
      ),
    });
  } else if (
    approvalRequests.some(
      (item) => item.standard === "permit2-signature-transfer",
    )
  ) {
    findings.push({
      code: "permit2-signature-transfer",
      severity: "warning",
      title: "Permit2 signature-based transfer requested",
      detail:
        "Permit2 can authorize a caller-dependent spender without a persistent ERC-20 allowance. Review the signer, token, amount, recipient, nonce, and deadline.",
      addresses: uniqueAddresses(
        approvalRequests
          .filter((item) => item.standard === "permit2-signature-transfer")
          .map((item) => item.token)
          .filter((address): address is Address => address !== null),
      ),
    });
  }

  const newSpenders = [
    ...input.allowances
      .filter((item) => item.newSpenderAtAnchor === true)
      .flatMap((item) => [item.token, item.spender]),
    ...approvalRequests
      .filter((item) => item.newSpenderAtAnchor === true)
      .flatMap((item) =>
        [item.token, item.spender].filter(
          (address): address is Address => address !== null,
        ),
      ),
  ];
  if (newSpenders.length > 0) {
    findings.push({
      code: "new-approval-spender",
      severity: "warning",
      title: "Allowance targets a spender with zero prior allowance",
      detail:
        "The allowance was zero at the stated comparison anchor. Same-block ordering and pending-state changes remain explicit coverage limits.",
      addresses: uniqueAddresses(newSpenders),
    });
  }

  const explicitlyFlagged = addresses.filter(
    (assessment) => assessment.status === "flagged",
  );
  if (explicitlyFlagged.length > 0) {
    findings.push({
      code: "explicitly-flagged-address",
      severity: "critical",
      title: "An involved address is explicitly flagged",
      detail:
        "A profile-specific trust record marks one or more involved addresses as flagged.",
      addresses: explicitlyFlagged.map((assessment) => assessment.address),
    });
  }

  if (!input.targetVerified) {
    findings.push({
      code: "unverified-target",
      severity: "warning",
      title: "Target source is not verified",
      detail:
        "No verified contract ABI was available for the transaction target.",
      addresses: [input.target],
    });
  }

  if (input.decodeConfidence === "signature") {
    findings.push({
      code: "signature-only-decode",
      severity: "warning",
      title: "Call decode is based on a signature match",
      detail:
        "A function-signature match is not verified contract source and can be ambiguous.",
      addresses: [input.target],
    });
  } else if (input.decodeConfidence === "raw") {
    findings.push({
      code: "raw-calldata",
      severity: "warning",
      title: "Call data could not be decoded",
      detail: "The transaction action remains raw hexadecimal data.",
      addresses: [input.target],
    });
  }

  const movementAddresses = uniqueAddresses(
    input.movements.flatMap((movement) => [
      movement.token,
      movement.from,
      movement.to,
    ]),
  );
  const movementUnresolved = movementAddresses.flatMap((address) => {
    const assessment = addresses.find(
      (item) => addressKey(item.address) === addressKey(address),
    );
    return assessment && assessment.status === "unverified" ? [assessment] : [];
  });
  if (movementUnresolved.length > 0) {
    findings.push({
      code: "movement-trust-unresolved",
      severity: "warning",
      title: "Token movement address trust is incomplete",
      detail:
        "At least one token or event participant lacks known or profile-trusted evidence.",
      addresses: movementUnresolved.map((assessment) => assessment.address),
    });
  }

  const boundedAllowances = input.allowances.filter((item) => !item.infinite);
  const boundedRequests = approvalRequests.filter(
    (item) =>
      item.standard !== "permit2-signature-transfer" && item.infinite !== true,
  );
  const boundedAddresses = uniqueAddresses([
    ...boundedAllowances.flatMap((allowance) => [
      allowance.token,
      allowance.spender,
    ]),
    ...boundedRequests.flatMap((approval) =>
      [approval.token, approval.spender].filter(
        (address): address is Address => address !== null,
      ),
    ),
  ]);
  const boundedUnresolved = addresses.filter(
    (assessment) =>
      boundedAddresses.some(
        (address) => addressKey(address) === addressKey(assessment.address),
      ) && assessment.status === "unverified",
  );
  if (boundedUnresolved.length > 0) {
    findings.push({
      code: "spender-trust-unresolved",
      severity: "warning",
      title: "Approval address trust is incomplete",
      detail:
        "The allowance is bounded, but its token or spender lacks known or profile-trusted evidence.",
      addresses: boundedUnresolved.map((assessment) => assessment.address),
    });
  }

  const internalTargets = uniqueAddresses(
    input.internalCalls.map((call) => call.to),
  );
  const unresolvedInternalTargets = addresses.filter(
    (assessment) =>
      internalTargets.some(
        (address) => addressKey(address) === addressKey(assessment.address),
      ) && assessment.status === "unverified",
  );
  if (unresolvedInternalTargets.length > 0) {
    findings.push({
      code: "internal-call-trust-unresolved",
      severity: "warning",
      title: "Internal call target trust is incomplete",
      detail:
        "At least one traced internal target lacks known or profile-trusted evidence.",
      addresses: unresolvedInternalTargets.map(
        (assessment) => assessment.address,
      ),
    });
  }

  const traceDetail =
    input.callTrace === "complete"
      ? "Traced internal targets and delegate calls are evaluated."
      : input.callTrace === "partial"
        ? "Visible internal targets and delegate calls are evaluated, but the trace was truncated by safety bounds."
        : "Internal calls are not evaluated because no usable trace was returned.";
  const storageDetail =
    input.storageDiff === "complete"
      ? "Raw storage slots are displayed but are not semantically scored."
      : input.storageDiff === "partial"
        ? "A bounded subset of raw storage slots is displayed but is not semantically scored."
        : "Storage changes are unavailable.";
  const evidenceDetail =
    input.outcome === "on-chain-receipt"
      ? "This verdict uses the target, decode provenance, mined receipt events, traced call targets when available, authoritative registry records, and profile-specific trust records."
      : input.outcome === "read-only-call"
        ? "This verdict uses the target, decode provenance, direct-call outcome, traced call targets when available, authoritative registry records, and profile-specific trust records. Receipt events are unavailable."
        : "This verdict uses target metadata, decode provenance, authoritative registry records, and profile-specific trust records only. Execution behavior is unavailable.";

  findings.push({
    code: "partial-analysis-coverage",
    severity: "info",
    title: "Analysis coverage is bounded",
    detail: [evidenceDetail, traceDetail, storageDetail].join(" "),
    addresses: [],
  });

  const hasCritical = findings.some(
    (finding) => finding.severity === "critical",
  );
  const hasWarning = findings.some((finding) => finding.severity === "warning");
  const allExplicitlyTrusted =
    addresses.length > 0 &&
    addresses.every((assessment) => assessment.status === "trusted");
  const verdict: Verdict = hasCritical
    ? "flagged"
    : hasWarning
      ? "unverified"
      : allExplicitlyTrusted
        ? "trusted"
        : "known";

  return {
    verdict,
    headline:
      verdict === "flagged"
        ? "Critical evidence requires review"
        : verdict === "unverified"
          ? "Trust is not fully established"
          : verdict === "trusted"
            ? "All involved addresses are explicitly trusted"
            : "No risk signal in available evidence",
    findings,
    addresses,
    coverage:
      input.outcome === "on-chain-receipt"
        ? input.callTrace === "complete" || input.callTrace === "partial"
          ? "target-receipt-and-trace"
          : "target-and-receipt-only"
        : input.outcome === "read-only-call"
          ? input.callTrace === "complete" || input.callTrace === "partial"
            ? "target-call-and-trace"
            : "target-and-call-only"
          : "target-only",
    trustBoundary:
      "Trusted requires an explicit profile-specific record. Registry and verified-source evidence can establish known, never trusted. Critical evidence always takes precedence.",
  };
}
