import type { Finding, FindingSeverity } from "@/core/domain";

export interface FindingGuidance {
  readonly label: string;
  readonly action: string;
}

const GUIDANCE_BY_CODE = new Map<string, FindingGuidance>([
  [
    "delegatecall-operation",
    {
      label: "Verify storage authority",
      action:
        "Confirm the target and implementation are the exact contracts you intend to trust with the Safe's storage. Inspect traced storage effects before signing.",
    },
  ],
  [
    "internal-delegatecall",
    {
      label: "Trace the delegated code",
      action:
        "Identify the delegated implementation and confirm why it must execute in its caller's storage context. Do not sign if the boundary is unexpected.",
    },
  ],
  [
    "infinite-allowance",
    {
      label: "Review or revoke the allowance",
      action:
        "Confirm the token and spender are intended. If unlimited access is unnecessary, replace it with a bounded amount or revoke it after use.",
    },
  ],
  [
    "requested-infinite-allowance",
    {
      label: "Prefer a bounded allowance",
      action:
        "Confirm the token, spender, and protocol documentation. Use the smallest practical allowance unless unlimited access is explicitly required.",
    },
  ],
  [
    "requested-operator-all",
    {
      label: "Confirm full operator access",
      action:
        "Verify the operator independently and confirm it should control every compatible token held now or later. Reject the request if that scope is unexpected.",
    },
  ],
  [
    "maximum-permit2-signature-transfer",
    {
      label: "Validate every Permit2 field",
      action:
        "Confirm the token, maximum amount, recipient, nonce, deadline, and caller-dependent spender before signing.",
    },
  ],
  [
    "permit2-signature-transfer",
    {
      label: "Validate the Permit2 request",
      action:
        "Confirm the signer, token, amount, recipient, nonce, deadline, and effective spender against the protocol's official interface.",
    },
  ],
  [
    "new-approval-spender",
    {
      label: "Verify the new spender",
      action:
        "Confirm the spender address from an independent official source and check that the requested amount matches the intended action.",
    },
  ],
  [
    "explicitly-flagged-address",
    {
      label: "Stop and investigate",
      action:
        "An involved address is explicitly flagged in this profile. Resolve that trust record and verify the address independently before signing.",
    },
  ],
  [
    "unverified-target",
    {
      label: "Verify the target contract",
      action:
        "Match the target address and implementation against the protocol's official deployment records. Treat decoded labels as unconfirmed until source is verified.",
    },
  ],
  [
    "signature-only-decode",
    {
      label: "Confirm the method signature",
      action:
        "Compare the selector and parameters with a verified ABI or official protocol interface; signature databases can return ambiguous matches.",
    },
  ],
  [
    "raw-calldata",
    {
      label: "Decode before signing",
      action:
        "Obtain a verified ABI or independently decode the calldata. Do not rely on an opaque hexadecimal payload for an approval decision.",
    },
  ],
  [
    "movement-trust-unresolved",
    {
      label: "Identify movement participants",
      action:
        "Verify the token contract, sender, and recipient. Add profile trust only after matching each address to an independent official source.",
    },
  ],
  [
    "spender-trust-unresolved",
    {
      label: "Identify token and spender",
      action:
        "Verify both contracts from official deployment records and confirm the allowance amount. A bounded amount does not make an unknown spender safe.",
    },
  ],
  [
    "internal-call-trust-unresolved",
    {
      label: "Review traced targets",
      action:
        "Inspect every unknown internal target and confirm it belongs to the intended protocol path before signing.",
    },
  ],
  [
    "unrecognized-storage-change",
    {
      label: "Inspect changed storage",
      action:
        "Review the raw changed slots against verified implementation layout metadata. Do not assume an unmapped change is harmless.",
    },
  ],
  [
    "partial-analysis-coverage",
    {
      label: "Re-run the complete review",
      action:
        "Use a trace-capable provider when available and re-run the full review after the Safe proposal exists so signatures, nonce, guards, and execution wrapping can be checked.",
    },
  ],
  [
    "safe-batch-latest-bytecode-fallback",
    {
      label: "Confirm historical identity",
      action:
        "Verify that the batch executor at the transaction block matches the intended Safe deployment; current bytecode alone cannot prove its historical identity.",
    },
  ],
]);

const DEFAULT_ACTION_BY_SEVERITY: Record<FindingSeverity, FindingGuidance> = {
  critical: {
    label: "Resolve before signing",
    action:
      "Stop and independently verify the affected contracts, addresses, and parameters. Sign only after the critical evidence is fully explained.",
  },
  warning: {
    label: "Verify before signing",
    action:
      "Confirm the involved addresses and decoded parameters from an independent official source before approving this transaction.",
  },
  info: {
    label: "Understand the coverage",
    action:
      "No action is required by this note alone, but keep the stated evidence boundary in mind when making the final decision.",
  },
};

export function findingGuidance(finding: Finding): FindingGuidance {
  return (
    GUIDANCE_BY_CODE.get(finding.code) ??
    DEFAULT_ACTION_BY_SEVERITY[finding.severity]
  );
}

export function findingReviewSummary(findings: readonly Finding[]) {
  const critical = findings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  const warnings = findings.filter(
    (finding) => finding.severity === "warning",
  ).length;

  if (critical > 0) {
    return {
      tone: "critical" as const,
      title: "Do not sign until the critical findings are resolved",
      detail: `${critical} critical finding${critical === 1 ? "" : "s"} require independent verification. Start with the actions below.`,
    };
  }
  if (warnings > 0) {
    return {
      tone: "warning" as const,
      title: "Pause and verify the warnings before signing",
      detail: `${warnings} warning${warnings === 1 ? "" : "s"} identify missing trust or evidence. Complete the checks below before approving.`,
    };
  }
  return {
    tone: "clear" as const,
    title: "No material warning was detected in the available evidence",
    detail:
      "Still confirm the target, amounts, recipients, and coverage boundary against your intended transaction.",
  };
}
