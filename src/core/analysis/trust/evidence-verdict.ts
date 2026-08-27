import type {
  Address,
  Finding,
  Operation,
  Verdict,
} from "../../domain";

export type DecodeConfidence =
  | "verified"
  | "service"
  | "signature"
  | "raw";

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
  readonly callTrace: "root-only" | "unavailable";
  readonly storageDiff: "unavailable";
  readonly tokenEvents: "standard-events" | "unavailable";
}

export interface EvidenceVerdict {
  readonly verdict: Exclude<Verdict, "trusted">;
  readonly headline: string;
  readonly findings: readonly Finding[];
  readonly coverage: "target-and-receipt-only";
  readonly trustBoundary: string;
}

function uniqueAddresses(addresses: readonly Address[]): readonly Address[] {
  return [...new Set(addresses.map((address) => address.toLowerCase()))] as Address[];
}

export function evaluateEvidenceVerdict(
  input: EvidenceVerdictInput,
): EvidenceVerdict {
  const findings: Finding[] = [];

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

  if (input.movements.length > 0) {
    findings.push({
      code: "movement-trust-unresolved",
      severity: "warning",
      title: "Token movement address trust is not evaluated yet",
      detail:
        "Token event participants are visible, but address-book and registry trust checks are not implemented in this analysis version.",
      addresses: uniqueAddresses(
        input.movements.flatMap((movement) => [
          movement.token,
          movement.from,
          movement.to,
        ]),
      ),
    });
  }

  const boundedAllowances = input.allowances.filter((item) => !item.infinite);
  if (boundedAllowances.length > 0) {
    findings.push({
      code: "spender-trust-unresolved",
      severity: "warning",
      title: "Approval spender trust is not evaluated yet",
      detail:
        "The allowance amount is bounded, but address-book and registry trust checks are not implemented in this analysis version.",
      addresses: uniqueAddresses(
        boundedAllowances.flatMap((allowance) => [
          allowance.token,
          allowance.spender,
        ]),
      ),
    });
  }

  findings.push({
    code: "partial-analysis-coverage",
    severity: "info",
    title: "Analysis coverage is partial",
    detail:
      input.tokenEvents === "unavailable"
        ? "This verdict uses the target and decode provenance. Receipt token events, internal calls, and storage changes are not evaluated."
        : "This verdict uses the target, decode provenance, outer call, and receipt events. Internal calls and storage changes are not evaluated.",
    addresses: [],
  });

  const flagged = findings.some((finding) => finding.severity === "critical");
  const unverified = findings.some(
    (finding) => finding.severity === "warning",
  );
  const verdict: EvidenceVerdict["verdict"] = flagged
    ? "flagged"
    : unverified
      ? "unverified"
      : "known";

  return {
    verdict,
    headline:
      verdict === "flagged"
        ? "Critical evidence requires review"
        : verdict === "unverified"
          ? "Trust is not fully established"
          : "No risk signal in available evidence",
    findings,
    coverage: "target-and-receipt-only",
    trustBoundary:
      "Trusted is reserved for explicit address-book or registry rules and is never inferred from verification alone.",
  };
}
