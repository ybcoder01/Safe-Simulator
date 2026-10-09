import type { Finding, FindingSeverity } from "@/core/domain";

export interface FindingGuidance {
  readonly label: string;
  readonly action: string;
}

const GUIDANCE_BY_CODE = new Map<string, FindingGuidance>([
  [
    "flagged-address-involved",
    {
      label: "Stop and verify the address",
      action:
        "Do not approve. Compare the complete address with an independent source and contact the other Safe owners before taking any action.",
    },
  ],
  [
    "safe-control-change",
    {
      label: "Confirm the Safe control change",
      action:
        "Verify the owner, threshold, module, guard, fallback handler, or implementation change with every Safe owner before approving.",
    },
  ],
  [
    "unlimited-spending-access",
    {
      label: "Limit or reject the permission",
      action:
        "Confirm the complete spender address. Use a bounded amount unless unlimited access is explicitly required and independently verified.",
    },
  ],
  [
    "recipient-address-unconfirmed",
    {
      label: "Confirm the recipient",
      action:
        "Compare the complete recipient address with the original payment or protocol request before the final approval.",
    },
  ],
  [
    "spender-address-check",
    {
      label: "Confirm the spender and amount",
      action:
        "Verify the complete spender address and allowance against the intended project action before approving.",
    },
  ],
  [
    "target-address-unconfirmed",
    {
      label: "Confirm the main contract",
      action:
        "Match the complete destination address with the project's official deployment documentation before approving.",
    },
  ],
  [
    "protocol-path-unconfirmed",
    {
      label: "Confirm the project route",
      action:
        "The main project is recognized, but part of its internal route is not independently matched yet. Review the unmatched route before the final approval.",
    },
  ],
  [
    "protocol-route-attestation-incomplete",
    {
      label: "Check the remaining Silo contracts",
      action:
        "The Silo router and market are confirmed. The listed helper contracts are not yet matched to Silo's official records. Confirm them against Silo's deployment list before relying on this result.",
    },
  ],
  [
    "silo-permissionless-market",
    {
      label: "Confirm this specific Silo market",
      action:
        "Factory origin is confirmed, but Silo markets are permissionless. Confirm the market, assets, deployer, hooks, and oracles against your team's approved market record.",
    },
  ],
  [
    "additional-evidence-check",
    {
      label: "Review the remaining evidence",
      action:
        "Open Technical details and resolve the remaining evidence item before approving.",
    },
  ],
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
      label: "Check the helper contracts",
      action:
        "Lending and trading apps often borrow code from helper contracts. That is normal when the helpers belong to the project. Match each helper address to the project's official deployment list, and ask the project team if one is not listed.",
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
      label: "Confirm token spending access",
      action:
        "Confirm the spender address and requested amount. If the spender is recognized, verify that this protocol should receive token spending access for the intended action.",
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
      label: "Confirm what the action does",
      action:
        "The action name comes from a public lookup of the function, not from the contract's published code, so it could be wrong. Compare the amounts and recipients with what was requested.",
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
      label: "Check the other contracts involved",
      action:
        "The transaction touched contracts we could not match to official records. Confirm each belongs to the project you intended to use.",
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
      label: "Know what was not checked",
      action:
        "Part of the transaction's step-by-step activity was too large to review in full, so this result covers only what was visible. Re-run the review later if you need a complete picture.",
    },
  ],
  [
    "expected-safe-proxy-delegation",
    {
      label: "Normal Safe wallet behavior",
      action:
        "Safe wallets always run their logic through an official shared contract. This one matched Safe's official list. Nothing to do.",
    },
  ],
  [
    "expected-target-proxy-delegation",
    {
      label: "Normal upgradeable-contract behavior",
      action:
        "The main contract forwards to its official implementation, which we matched. Nothing to do.",
    },
  ],
  [
    "expected-internal-proxy-delegation",
    {
      label: "Normal upgradeable-contract behavior",
      action:
        "A contract inside the project forwards to its own implementation, which we matched. Nothing to do.",
    },
  ],
  [
    "expected-protocol-library-delegation",
    {
      label: "Normal project helper code",
      action:
        "The project's contract used a helper listed in the project's official records. Nothing to do.",
    },
  ],
  [
    "expected-safe-batch-delegation",
    {
      label: "Normal Safe batch behavior",
      action:
        "The transaction uses Safe's official batching contract. Each step inside it is checked separately.",
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
    label: "For your information",
    action:
      "No action is needed for this note by itself. It explains what the review could and could not see.",
  },
};

export function findingGuidance(finding: Finding): FindingGuidance {
  return (
    GUIDANCE_BY_CODE.get(finding.code) ??
    DEFAULT_ACTION_BY_SEVERITY[finding.severity]
  );
}

export function findingReviewSummary(
  findings: readonly Finding[],
  options: { readonly executed?: boolean } = {},
) {
  const executed = options.executed === true;
  const critical = findings.filter(
    (finding) => finding.severity === "critical",
  ).length;
  const warnings = findings.filter(
    (finding) => finding.severity === "warning",
  ).length;

  if (critical > 0) {
    return {
      tone: "critical" as const,
      title: executed
        ? "Investigate the critical findings"
        : "Do not sign until the critical findings are resolved",
      detail: `${critical} critical finding${critical === 1 ? "" : "s"} ${critical === 1 ? "needs" : "need"} independent verification. Start with the actions below.`,
    };
  }
  if (warnings > 0) {
    return {
      tone: "warning" as const,
      title: executed
        ? "Check the warnings against what your team intended"
        : "Pause and verify the warnings before signing",
      detail: executed
        ? `${warnings} warning${warnings === 1 ? "" : "s"} could not be matched to official records. This transaction already ran, so confirm the result was intended.`
        : `${warnings} warning${warnings === 1 ? "" : "s"} identify missing trust or evidence. Complete the checks below before approving.`,
    };
  }
  return {
    tone: "clear" as const,
    title: "No material warning was detected in the available evidence",
    detail:
      "Still confirm the target, amounts, recipients, and coverage boundary against your intended transaction.",
  };
}
