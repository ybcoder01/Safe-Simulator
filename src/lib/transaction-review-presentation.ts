import type { EvidenceVerdict } from "@/core/analysis/trust/evidence-verdict";
import type { SafeTransaction } from "@/core/domain";
import type { ExecutionInsight } from "@/lib/api/execution-insight";
import type { TargetRuntimeCodeEvidence } from "@/lib/api/transaction-analysis";

export type ReviewSignal = "clear" | "blocked" | "review" | "unknown";

export interface TransactionReviewPresentation {
  readonly signal: ReviewSignal;
  readonly icon: "✓" | "×" | "!" | "?";
  readonly title:
    | "No known risks found"
    | "Do not proceed"
    | "Review this executed transaction"
    | "Review before proceeding"
    | "Unable to verify";
  readonly detail: string;
  readonly nextStep: string;
  readonly targetType:
    | "Verified smart contract"
    | "Unverified smart contract"
    | "Wallet address"
    | "Unknown address type";
  readonly targetExplanation: string;
  readonly actionSummary: string;
  readonly addressCheckTitle: string;
  readonly addressCheckDetail: string;
  readonly addressChecks: readonly string[];
}

interface PresentationInput {
  readonly evidence: EvidenceVerdict;
  readonly execution: Pick<ExecutionInsight, "coverage" | "mode" | "success">;
  readonly primaryAction: string;
  readonly targetKnown: boolean;
  readonly target: Pick<TargetRuntimeCodeEvidence, "accountType" | "anchor">;
  readonly targetVerified: boolean;
  readonly transaction: Pick<
    SafeTransaction,
    "data" | "operation" | "status" | "value"
  >;
}

const ADDRESS_CHECK_COPY: Readonly<Record<string, string>> = {
  "explicitly-flagged-address":
    "A known flagged address is involved in this transaction.",
  "new-approval-spender":
    "A new address would receive permission to spend this Safe's tokens.",
  "infinite-allowance":
    "An address would receive unlimited permission to spend a token.",
  "requested-infinite-allowance":
    "The transaction requests unlimited token spending permission.",
  "requested-operator-all":
    "An operator would receive control over every compatible token.",
  "maximum-permit2-signature-transfer":
    "A Permit2 signature could authorize the maximum possible token amount.",
  "permit2-signature-transfer":
    "A Permit2 signature can authorize a spender without a normal token allowance.",
  "safe-owner-change": "The transaction changes who can control this Safe.",
  "safe-threshold-change":
    "The transaction changes how many owner approvals are required.",
  "safe-module-change":
    "The transaction changes a module that may bypass the normal owner approval flow.",
  "safe-guard-change": "The transaction changes the Safe's transaction guard.",
  "spender-trust-unresolved":
    "The token spender could not be matched to a trusted project address.",
  "movement-trust-unresolved":
    "At least one token or transfer participant could not be identified.",
  "internal-call-trust-unresolved":
    "The transaction routes through at least one unrecognized contract.",
  "internal-delegatecall":
    "An internal contract runs code with another contract's permissions.",
  "unverified-target":
    "The destination contract's published source could not be verified.",
  "unrecognized-storage-change":
    "The simulation found a contract storage change it could not explain.",
  "recipient-address-unconfirmed":
    "The recipient address could not be independently confirmed.",
  "spender-address-check":
    "A token spender or spending permission needs confirmation.",
  "protocol-path-unconfirmed":
    "Part of the project's internal contract route could not be independently confirmed.",
  "target-address-unconfirmed":
    "The main destination contract could not be independently confirmed.",
  "safe-control-change": "The transaction changes who can control this Safe.",
  "unlimited-spending-access":
    "A contract or operator would receive unlimited token access.",
  "flagged-address-involved": "A previously flagged address is involved.",
};

function addressCheckPresentation(
  input: PresentationInput,
): Pick<
  TransactionReviewPresentation,
  "addressCheckDetail" | "addressChecks" | "addressCheckTitle"
> {
  const checks = [
    ...new Set(
      input.evidence.findings.flatMap((finding) => {
        const copy = ADDRESS_CHECK_COPY[finding.code];
        return copy ? [copy] : [];
      }),
    ),
  ].slice(0, 3);

  if (!input.targetKnown) {
    checks.unshift(
      "The main destination is not in the reviewed protocol registry.",
    );
  }

  if (checks.length > 0) {
    return {
      addressCheckTitle: "Some addresses need verification",
      addressCheckDetail:
        "This does not prove an address was injected. It means Safe Inspector could not confirm every important address from independent project records.",
      addressChecks: checks.slice(0, 3),
    };
  }

  return {
    addressCheckTitle: "No obvious address replacement found",
    addressCheckDetail:
      "The destination and high-impact addresses matched the evidence available to Safe Inspector. Still compare them with the transaction you intended to create.",
    addressChecks: [],
  };
}

function actionSummary(input: PresentationInput): string {
  if (
    input.target.accountType === "wallet" &&
    input.transaction.data === "0x"
  ) {
    return input.transaction.value > 0n
      ? `Send ${input.transaction.value.toString()} wei to a wallet address`
      : "Send a zero-value transfer to a wallet address";
  }

  if (input.transaction.operation === "delegatecall") {
    return `Run delegated contract code: ${input.primaryAction}`;
  }

  return input.primaryAction;
}

function targetPresentation(
  input: PresentationInput,
): Pick<TransactionReviewPresentation, "targetExplanation" | "targetType"> {
  if (input.target.accountType === "wallet") {
    return {
      targetType: "Wallet address",
      targetExplanation:
        "This is a wallet, not a smart contract. It can receive assets but cannot run programmed contract actions.",
    };
  }

  if (input.target.accountType === "contract") {
    return input.targetVerified
      ? {
          targetType: "Verified smart contract",
          targetExplanation:
            "This is a smart contract. Its published code or interface was independently verified.",
        }
      : {
          targetType: "Unverified smart contract",
          targetExplanation:
            "This is a smart contract, but its published code could not be verified. Confirm the address with the protocol before continuing.",
        };
  }

  return {
    targetType: "Unknown address type",
    targetExplanation:
      "We could not determine whether this address is a wallet or a smart contract. Do not continue until you verify it independently.",
  };
}

export function resolveTransactionReviewPresentation(
  input: PresentationInput,
): TransactionReviewPresentation {
  const target = targetPresentation(input);
  const addressCheck = addressCheckPresentation(input);
  const hasCritical = input.evidence.findings.some(
    (finding) => finding.severity === "critical",
  );
  const hasWarning = input.evidence.findings.some(
    (finding) => finding.severity === "warning",
  );
  const essentialEvidenceUnavailable =
    input.target.accountType === "unavailable" ||
    input.execution.mode === "unavailable" ||
    input.execution.success === null ||
    input.execution.coverage.outcome === "unavailable";

  if (hasCritical || input.execution.success === false) {
    return {
      ...target,
      ...addressCheck,
      signal: "blocked",
      icon: "×",
      title:
        input.transaction.status === "executed"
          ? "Review this executed transaction"
          : "Do not proceed",
      detail:
        input.transaction.status === "executed"
          ? "This transaction already went through, but the evidence contains a serious warning that should be investigated."
          : "A serious warning or failed simulation was found. Do not give the final approval until it is explained.",
      nextStep:
        input.transaction.status === "executed"
          ? "Confirm the project, destination, recipients, and permissions now. Revoke unexpected access and contact the other signers if anything is unfamiliar."
          : "Confirm the project, full destination address, recipients, and permissions with the proposer before anyone gives the final approval.",
      actionSummary: actionSummary(input),
    };
  }

  if (essentialEvidenceUnavailable) {
    return {
      ...target,
      ...addressCheck,
      signal: "unknown",
      icon: "?",
      title: "Unable to verify",
      detail:
        "Essential contract or execution evidence is unavailable, so this transaction cannot be given a reliable safety result.",
      nextStep:
        "Retry the analysis or verify the transaction with another trusted source before proceeding.",
      actionSummary: actionSummary(input),
    };
  }

  if (hasWarning || input.target.anchor === "latest-fallback") {
    return {
      ...target,
      ...addressCheck,
      signal: "review",
      icon: "!",
      title: "Review before proceeding",
      detail:
        "The transaction was analyzed, but one or more warnings still need your attention.",
      nextStep:
        "Review each warning and confirm the destination, amounts, and permissions match what you intended.",
      actionSummary: actionSummary(input),
    };
  }

  return {
    ...target,
    ...addressCheck,
    signal: "clear",
    icon: "✓",
    title: "No known risks found",
    detail:
      "The checks we could perform did not find a known risk. This is evidence-based guidance, not a guarantee.",
    nextStep:
      "Confirm the destination and transaction details match your intent before proceeding in your wallet.",
    actionSummary: actionSummary(input),
  };
}
