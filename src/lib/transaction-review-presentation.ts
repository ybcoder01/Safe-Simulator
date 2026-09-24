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
}

interface PresentationInput {
  readonly evidence: EvidenceVerdict;
  readonly execution: Pick<ExecutionInsight, "coverage" | "mode" | "success">;
  readonly primaryAction: string;
  readonly target: Pick<TargetRuntimeCodeEvidence, "accountType" | "anchor">;
  readonly targetVerified: boolean;
  readonly transaction: Pick<SafeTransaction, "data" | "operation" | "value">;
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
      signal: "blocked",
      icon: "×",
      title: "Do not proceed",
      detail:
        "The available evidence found a critical risk or a failed execution outcome.",
      nextStep:
        "Stop and independently verify the highlighted addresses, permissions, and contract behavior before taking any action.",
      actionSummary: actionSummary(input),
    };
  }

  if (essentialEvidenceUnavailable) {
    return {
      ...target,
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
