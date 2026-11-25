import { keccak256, stringToHex } from "viem";

import type {
  Address,
  AnalysisReviewContext,
  SafeSnapshot,
  SafeTransaction,
} from "@/core/domain";
import type { ContractInsight } from "@/lib/api/contract-insight";
import type { ExecutionInsight } from "@/lib/api/execution-insight";
import type { TargetRuntimeCodeEvidence } from "@/lib/api/transaction-analysis";

const addresses = (values: readonly string[]) =>
  [...new Set(values.map((value) => value.toLowerCase() as Address))].sort();
const orderedAddresses = (values: readonly string[]) =>
  values.map((value) => value.toLowerCase() as Address);

function fingerprintExecution(execution: ExecutionInsight) {
  if (execution.mode === "unavailable") return null;
  const evidence = {
    success: execution.success,
    internalCalls: execution.internalCalls.map((call) => ({
      from: call.from.toLowerCase(),
      to: call.to.toLowerCase(),
      value: call.value,
      operation: call.operation,
      reverted: call.reverted,
    })),
    tokenMovements: execution.tokenMovements.map((movement) => ({
      token: movement.token.toLowerCase(),
      from: movement.from.toLowerCase(),
      to: movement.to.toLowerCase(),
      amount: movement.amount,
    })),
    allowanceChanges: execution.allowanceChanges.map((change) => ({
      token: change.token.toLowerCase(),
      owner: change.owner.toLowerCase(),
      spender: change.spender.toLowerCase(),
      amount: change.amount,
    })),
    safeConfigurationChanges: execution.safeConfigurationChanges,
  };
  return keccak256(stringToHex(JSON.stringify(evidence)));
}

export function buildAnalysisReviewContext(input: {
  readonly capturedAt: number;
  readonly transaction: SafeTransaction;
  readonly safe: SafeSnapshot | null;
  readonly contract: ContractInsight;
  readonly execution: ExecutionInsight;
  readonly targetRuntimeCode: TargetRuntimeCodeEvidence;
}): AnalysisReviewContext {
  return {
    capturedAt: input.capturedAt,
    targetCodeHash: input.targetRuntimeCode.hash,
    implementationChain: orderedAddresses(input.contract.implementationChain),
    confirmationOwners: addresses(
      input.transaction.confirmations.map((item) => item.owner),
    ),
    simulationFingerprint: fingerprintExecution(input.execution),
    safe: input.safe
      ? {
          owners: addresses(input.safe.owners),
          threshold: input.safe.threshold,
          nonce: input.safe.nonce.toString(),
          guard:
            (input.safe.guard?.toLowerCase() as Address | undefined) ?? null,
          modules: addresses(input.safe.modules),
          implementation:
            (input.safe.implementation?.toLowerCase() as Address | undefined) ??
            null,
        }
      : null,
  };
}

export type ReviewDriftSeverity = "info" | "warning" | "critical";

export interface ReviewDriftChange {
  readonly key: string;
  readonly severity: ReviewDriftSeverity;
  readonly title: string;
  readonly detail: string;
}

export interface ReviewDriftResult {
  readonly status: "unchanged" | "changed" | "unavailable";
  readonly baselineAt: number | null;
  readonly checkedAt: number;
  readonly changes: readonly ReviewDriftChange[];
}

const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

export function compareAnalysisReviewContexts(
  baseline: AnalysisReviewContext | null,
  current: AnalysisReviewContext,
): ReviewDriftResult {
  if (!baseline) {
    return {
      status: "unavailable",
      baselineAt: null,
      checkedAt: current.capturedAt,
      changes: [],
    };
  }

  const changes: ReviewDriftChange[] = [];
  const add = (
    changed: boolean,
    key: string,
    severity: ReviewDriftSeverity,
    title: string,
    detail: string,
  ) => {
    if (changed) changes.push({ key, severity, title, detail });
  };

  add(
    baseline.targetCodeHash !== current.targetCodeHash,
    "target-code",
    "critical",
    "Target contract code changed",
    "The destination now has a different runtime-code hash than the original review.",
  );
  add(
    !same(baseline.implementationChain, current.implementationChain),
    "implementation-chain",
    "critical",
    "Proxy implementation route changed",
    "The destination resolves to a different implementation chain than the original review.",
  );
  add(
    !same(baseline.safe, current.safe),
    "safe-configuration",
    "critical",
    "Safe configuration changed",
    "Owners, threshold, nonce, guard, modules, or the Safe implementation differ from the original review.",
  );
  add(
    baseline.simulationFingerprint !== current.simulationFingerprint,
    "simulation",
    "warning",
    "Simulated effects changed",
    "The latest simulation produced different calls, movements, allowances, configuration effects, or outcome.",
  );
  add(
    !same(baseline.confirmationOwners, current.confirmationOwners),
    "signatures",
    "info",
    "Signature progress changed",
    "The set of published Safe confirmations changed after the original review. The signed transaction hash is unchanged.",
  );

  return {
    status: changes.length > 0 ? "changed" : "unchanged",
    baselineAt: baseline.capturedAt,
    checkedAt: current.capturedAt,
    changes,
  };
}
