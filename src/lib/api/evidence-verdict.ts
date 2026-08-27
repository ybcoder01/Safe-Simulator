import {
  evaluateEvidenceVerdict,
  type DecodeConfidence,
  type EvidenceVerdict,
  type EvidenceVerdictInput,
} from "@/core/analysis/trust/evidence-verdict";
import type { Address, SafeTransaction } from "@/core/domain";
import type { ContractInsight } from "@/lib/api/contract-insight";
import type { ExecutionInsight } from "@/lib/api/execution-insight";

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
): EvidenceVerdict {
  const input = {
    operation: transaction.operation,
    target: transaction.to,
    targetVerified: contract.metadata.verified,
    decodeConfidence: decodeConfidence(contract.provenance),
    allowances: execution.allowanceChanges.map((allowance) => ({
      token: allowance.token as Address,
      spender: allowance.spender as Address,
      amount: allowance.amount,
      infinite: allowance.infinite,
    })),
    callTrace: execution.coverage.callTrace,
    storageDiff: execution.coverage.storageDiff,
    tokenEvents: execution.coverage.tokenEvents,
  } satisfies EvidenceVerdictInput;

  return evaluateEvidenceVerdict(input);
}
