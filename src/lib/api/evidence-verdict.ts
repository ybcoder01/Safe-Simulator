import {
  evaluateEvidenceVerdict,
  type DecodeConfidence,
  type EvidenceVerdict,
  type EvidenceVerdictInput,
} from "@/core/analysis/trust/evidence-verdict";
import type { Address, AddressBookEntry, SafeTransaction } from "@/core/domain";
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
  addressBook: readonly AddressBookEntry[],
): EvidenceVerdict {
  const input = {
    operation: transaction.operation,
    target: transaction.to,
    targetVerified: contract.metadata.verified,
    decodeConfidence: decodeConfidence(contract.provenance),
    movements: execution.tokenMovements.map((movement) => ({
      token: movement.token as Address,
      from: movement.from as Address,
      to: movement.to as Address,
    })),
    allowances: execution.allowanceChanges.map((allowance) => ({
      token: allowance.token as Address,
      spender: allowance.spender as Address,
      amount: allowance.amount,
      infinite: allowance.infinite,
    })),
    internalCalls: execution.internalCalls.map((call) => ({
      to: call.to as Address,
      operation: call.operation,
    })),
    addressBook,
    callTrace: execution.coverage.callTrace,
    storageDiff: execution.coverage.storageDiff,
    tokenEvents: execution.coverage.tokenEvents,
    outcome: execution.coverage.outcome,
  } satisfies EvidenceVerdictInput;

  return evaluateEvidenceVerdict(input);
}
