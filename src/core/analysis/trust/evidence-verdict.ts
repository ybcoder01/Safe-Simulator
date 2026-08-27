import type {
  Address,
  AddressBookEntry,
  Finding,
  Operation,
  Verdict,
} from "../../domain";

export type DecodeConfidence = "verified" | "service" | "signature" | "raw";
export type AddressRole =
  | "target"
  | "token"
  | "movement-sender"
  | "movement-recipient"
  | "approval-spender";

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
  }[];
  readonly addressBook: readonly AddressBookEntry[];
  readonly callTrace: "root-only" | "unavailable";
  readonly storageDiff: "unavailable";
  readonly tokenEvents: "standard-events" | "unavailable";
  readonly outcome: "on-chain-receipt" | "read-only-call" | "unavailable";
}

export interface AddressTrustAssessment {
  readonly address: Address;
  readonly label: string | null;
  readonly status: Verdict;
  readonly roles: readonly AddressRole[];
}

export interface EvidenceVerdict {
  readonly verdict: Verdict;
  readonly headline: string;
  readonly findings: readonly Finding[];
  readonly addresses: readonly AddressTrustAssessment[];
  readonly coverage:
    | "target-and-receipt-only"
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
    const current = roles.get(key) ?? { address, roles: new Set<AddressRole>() };
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

  const records = new Map<string, AddressBookEntry>();
  for (const record of input.addressBook) {
    const key = addressKey(record.address);
    const current = records.get(key);
    if (!current || record.trust === "flagged") records.set(key, record);
  }

  return [...roles.values()].map(({ address, roles: addressRoles }) => {
    const record = records.get(addressKey(address));
    const isVerifiedTarget =
      addressRoles.has("target") &&
      addressKey(address) === addressKey(input.target) &&
      input.targetVerified;

    return {
      address,
      label: record?.label ?? null,
      status: record?.trust ?? (isVerifiedTarget ? "known" : "unverified"),
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

  for (const allowance of input.allowances.filter((item) => item.infinite)) {
    findings.push({
      code: "infinite-allowance",
      severity: "critical",
      title: "Infinite token allowance emitted",
      detail: `Token ${allowance.token} emitted a maximum-value allowance for spender ${allowance.spender}.`,
      addresses: [allowance.token, allowance.spender],
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
  const movementUnresolved = addresses.filter(
    (assessment) =>
      movementAddresses.some(
        (address) => addressKey(address) === addressKey(assessment.address),
      ) &&
      assessment.status !== "trusted" &&
      assessment.status !== "flagged",
  );
  if (movementUnresolved.length > 0) {
    findings.push({
      code: "movement-trust-unresolved",
      severity: "warning",
      title: "Token movement address trust is incomplete",
      detail:
        "At least one token or event participant lacks an explicit trusted record.",
      addresses: movementUnresolved.map((assessment) => assessment.address),
    });
  }

  const boundedAllowances = input.allowances.filter((item) => !item.infinite);
  const boundedAddresses = uniqueAddresses(
    boundedAllowances.flatMap((allowance) => [
      allowance.token,
      allowance.spender,
    ]),
  );
  const boundedUnresolved = addresses.filter(
    (assessment) =>
      boundedAddresses.some(
        (address) => addressKey(address) === addressKey(assessment.address),
      ) &&
      assessment.status !== "trusted" &&
      assessment.status !== "flagged",
  );
  if (boundedUnresolved.length > 0) {
    findings.push({
      code: "spender-trust-unresolved",
      severity: "warning",
      title: "Approval address trust is incomplete",
      detail:
        "The allowance is bounded, but its token or spender lacks an explicit trusted record.",
      addresses: boundedUnresolved.map((assessment) => assessment.address),
    });
  }

  findings.push({
    code: "partial-analysis-coverage",
    severity: "info",
    title: "Analysis coverage is partial",
    detail:
      input.outcome === "on-chain-receipt"
        ? "This verdict uses the target, decode provenance, outer call, receipt events, and profile-specific trust records. Internal calls and storage changes are not evaluated."
        : input.outcome === "read-only-call"
          ? "This verdict uses the target, decode provenance, a direct read-only call, and profile-specific trust records. Receipt events, internal calls, and storage changes are not evaluated."
          : "This verdict uses target metadata, decode provenance, and profile-specific trust records only. Execution behavior, receipt events, internal calls, and storage changes are not evaluated.",
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
        ? "target-and-receipt-only"
        : input.outcome === "read-only-call"
          ? "target-and-call-only"
          : "target-only",
    trustBoundary:
      "Trusted requires explicit profile-specific records and is never inferred from source verification alone. Critical evidence always takes precedence.",
  };
}
