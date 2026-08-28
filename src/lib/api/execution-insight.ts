import type {
  Address,
  CallNode,
  Hex,
  LogEntry,
  SafeTransaction,
  SimulationOutput,
} from "@/core/domain";
import { extractTokenEventFacts } from "@/core/analysis/tokens/event-facts";
import type { CachePort, PersistencePort, SimulationPort } from "@/core/ports";

export interface ExecutionInsight {
  readonly mode: "executed-replay" | "direct-call-check" | "unavailable";
  readonly success: boolean | null;
  readonly gasUsed: string | null;
  readonly blockNumber: string | null;
  readonly blockHash: Hex | null;
  readonly rootCall: {
    readonly from: string;
    readonly to: string;
    readonly input: Hex;
    readonly value: string;
    readonly reverted: boolean;
  } | null;
  readonly internalCalls: readonly {
    readonly depth: number;
    readonly from: string;
    readonly to: string;
    readonly input: Hex;
    readonly value: string;
    readonly operation: "call" | "delegatecall";
    readonly reverted: boolean;
    readonly error: string | null;
  }[];
  readonly logs: readonly {
    readonly address: string;
    readonly topics: readonly Hex[];
    readonly data: Hex;
    readonly logIndex: number;
  }[];
  readonly storageChanges: readonly {
    readonly address: string;
    readonly slot: Hex;
    readonly before: Hex;
    readonly after: Hex;
  }[];
  readonly tokenMovements: readonly {
    readonly token: string;
    readonly from: string;
    readonly to: string;
    readonly amount: string;
    readonly direction: "inbound" | "outbound" | "self" | "external";
    readonly logIndex: number;
  }[];
  readonly allowanceChanges: readonly {
    readonly token: string;
    readonly owner: string;
    readonly spender: string;
    readonly amount: string;
    readonly infinite: boolean;
    readonly logIndex: number;
  }[];
  readonly error: string | null;
  readonly coverage: {
    readonly outcome: "on-chain-receipt" | "read-only-call" | "unavailable";
    readonly callTrace: "complete" | "partial" | "root-only" | "unavailable";
    readonly eventLogs: "complete" | "unavailable";
    readonly tokenEvents: "standard-events" | "unavailable";
    readonly storageDiff: "complete" | "partial" | "unavailable";
  };
  readonly warnings: readonly string[];
}

export const EXECUTION_EVIDENCE_ENGINE_VERSION = "execution-evidence-v1";

export interface ExecutionEvidenceStores {
  readonly cache: Pick<CachePort, "get" | "set">;
  readonly persistence: Pick<
    PersistencePort,
    "findExecutionEvidence" | "saveExecutionEvidence"
  >;
}

interface CachedExecutionEvidence {
  readonly engineVersion: string;
  readonly blockHash: Hex;
  readonly insight: ExecutionInsight;
}

function evidenceCacheKey(transaction: SafeTransaction, blockHash: Hex) {
  return [
    "execution-evidence",
    EXECUTION_EVIDENCE_ENGINE_VERSION,
    transaction.safe.chainId,
    transaction.safeTxHash.toLowerCase(),
    blockHash.toLowerCase(),
  ].join(":");
}

function hasCompleteTrace(output: SimulationOutput) {
  return (
    output.traceCoverage?.callTrace === "complete" &&
    output.traceCoverage.storageDiff === "complete"
  );
}

function hasCompleteInsight(insight: ExecutionInsight) {
  return (
    insight.mode === "executed-replay" &&
    insight.coverage.callTrace === "complete" &&
    insight.coverage.storageDiff === "complete"
  );
}

async function findStoredExecutionInsight(
  stores: ExecutionEvidenceStores,
  transaction: SafeTransaction,
): Promise<ExecutionInsight | null> {
  const blockHash = transaction.blockHash;
  if (!blockHash) return null;

  const key = evidenceCacheKey(transaction, blockHash);
  try {
    const cached = await stores.cache.get<CachedExecutionEvidence>(key);
    if (
      cached?.engineVersion === EXECUTION_EVIDENCE_ENGINE_VERSION &&
      cached.blockHash.toLowerCase() === blockHash.toLowerCase() &&
      hasCompleteInsight(cached.insight)
    ) {
      return cached.insight;
    }
  } catch {
    // PostgreSQL remains authoritative when Redis is unavailable.
  }

  try {
    const record = await stores.persistence.findExecutionEvidence(
      transaction.safe,
      transaction.safeTxHash,
      EXECUTION_EVIDENCE_ENGINE_VERSION,
      blockHash,
    );
    if (
      !record ||
      record.blockHash.toLowerCase() !== blockHash.toLowerCase() ||
      !hasCompleteTrace(record.simulation)
    ) {
      return null;
    }

    const insight = outputView(
      "executed-replay",
      record.simulation,
      transaction.safe.address,
    );
    try {
      await stores.cache.set<CachedExecutionEvidence>(
        key,
        {
          engineVersion: EXECUTION_EVIDENCE_ENGINE_VERSION,
          blockHash,
          insight,
        },
        null,
      );
    } catch {
      // A cache write failure must not discard authoritative stored evidence.
    }
    return insight;
  } catch {
    return null;
  }
}

async function persistExecutionInsight(
  stores: ExecutionEvidenceStores,
  transaction: SafeTransaction,
  output: SimulationOutput,
  insight: ExecutionInsight,
): Promise<void> {
  const blockHash = transaction.blockHash;
  if (
    !blockHash ||
    output.blockHash.toLowerCase() !== blockHash.toLowerCase() ||
    !hasCompleteTrace(output)
  ) {
    return;
  }

  try {
    await stores.persistence.saveExecutionEvidence({
      safe: transaction.safe,
      safeTxHash: transaction.safeTxHash,
      engineVersion: EXECUTION_EVIDENCE_ENGINE_VERSION,
      blockHash,
      simulation: output,
      createdAt: Math.floor(Date.now() / 1_000),
    });
  } catch {
    return;
  }

  try {
    await stores.cache.set<CachedExecutionEvidence>(
      evidenceCacheKey(transaction, blockHash),
      {
        engineVersion: EXECUTION_EVIDENCE_ENGINE_VERSION,
        blockHash,
        insight,
      },
      null,
    );
  } catch {
    // PostgreSQL already has the evidence; Redis can be repopulated later.
  }
}

function logsView(logs: readonly LogEntry[]): ExecutionInsight["logs"] {
  return logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    logIndex: log.logIndex,
  }));
}

function internalCallView(root: CallNode): ExecutionInsight["internalCalls"] {
  const calls: Array<ExecutionInsight["internalCalls"][number]> = [];

  function visit(nodes: readonly CallNode[], depth: number) {
    for (const node of nodes) {
      calls.push({
        depth,
        from: node.from,
        to: node.to,
        input: node.input,
        value: node.value.toString(),
        operation: node.operation,
        reverted: node.reverted,
        error: node.error,
      });
      visit(node.calls, depth + 1);
    }
  }

  visit(root.calls, 1);
  return calls;
}

function coverageWarnings(
  executed: boolean,
  callTrace: ExecutionInsight["coverage"]["callTrace"],
  storageDiff: ExecutionInsight["coverage"]["storageDiff"],
): readonly string[] {
  const warnings = [
    executed
      ? "Outcome, gas, block, and event logs come from the mined transaction receipt."
      : "This is a direct read-only call from the Safe address, not a full Safe signature-path simulation.",
  ];

  if (callTrace === "complete") {
    warnings.push(
      "Internal calls come from the configured debug tracer and are bounded before serialization.",
    );
  } else if (callTrace === "partial") {
    warnings.push(
      "The debug call trace exceeded safety bounds; the visible internal calls are incomplete.",
    );
  } else {
    warnings.push(
      executed
        ? "No usable debug call trace was returned; only the outer call is shown."
        : "Delegatecall behavior cannot be established without a usable debug call trace.",
    );
  }

  if (storageDiff === "complete") {
    warnings.push(
      "Storage changes are raw slot differences from prestate tracer diff mode; unmapped slots are not interpreted.",
    );
  } else if (storageDiff === "partial") {
    warnings.push(
      "The storage diff exceeded safety bounds; the visible raw slot changes are incomplete.",
    );
  } else {
    warnings.push(
      executed
        ? "No usable prestate diff was returned; storage changes remain unavailable."
        : "Storage changes are unavailable without a usable prestate diff.",
    );
  }

  if (executed) {
    warnings.push(
      "Token facts recognize canonical ERC-20-shaped events; an emitted event does not prove standard compliance.",
    );
  } else {
    warnings.push("Event logs are not returned by the direct call check.");
  }

  return warnings;
}

function outputView(
  mode: ExecutionInsight["mode"],
  output: SimulationOutput,
  safe: Address,
): ExecutionInsight {
  const executed = mode === "executed-replay";
  const tokenEvents = extractTokenEventFacts(output.logs, safe);
  const traceCoverage = output.traceCoverage ?? {
    callTrace: "unavailable" as const,
    storageDiff: "unavailable" as const,
  };
  const callTrace =
    traceCoverage.callTrace === "unavailable"
      ? ("root-only" as const)
      : traceCoverage.callTrace;

  return {
    mode,
    success: output.success,
    gasUsed: output.gasUsed?.toString() ?? null,
    blockNumber: output.blockNumber.toString(),
    blockHash: output.blockHash,
    rootCall: {
      from: output.callTree.from,
      to: output.callTree.to,
      input: output.callTree.input,
      value: output.callTree.value.toString(),
      reverted: output.callTree.reverted,
    },
    internalCalls: internalCallView(output.callTree),
    logs: logsView(output.logs),
    storageChanges: output.storageChanges.map((change) => ({ ...change })),
    tokenMovements: tokenEvents.movements.map((movement) => ({
      ...movement,
      amount: movement.amount.toString(),
    })),
    allowanceChanges: tokenEvents.allowances.map((allowance) => ({
      ...allowance,
      amount: allowance.amount.toString(),
    })),
    error: output.error,
    coverage: {
      outcome: executed ? "on-chain-receipt" : "read-only-call",
      callTrace,
      eventLogs: executed ? "complete" : "unavailable",
      tokenEvents: executed ? "standard-events" : "unavailable",
      storageDiff: traceCoverage.storageDiff,
    },
    warnings: coverageWarnings(executed, callTrace, traceCoverage.storageDiff),
  };
}

function unavailable(error: string): ExecutionInsight {
  return {
    mode: "unavailable",
    success: null,
    gasUsed: null,
    blockNumber: null,
    blockHash: null,
    rootCall: null,
    internalCalls: [],
    logs: [],
    storageChanges: [],
    tokenMovements: [],
    allowanceChanges: [],
    error,
    coverage: {
      outcome: "unavailable",
      callTrace: "unavailable",
      eventLogs: "unavailable",
      tokenEvents: "unavailable",
      storageDiff: "unavailable",
    },
    warnings: [
      "No execution verdict has been inferred from incomplete provider data.",
    ],
  };
}

export async function resolveExecutionInsight(
  simulation: SimulationPort,
  transaction: SafeTransaction,
  stores?: ExecutionEvidenceStores,
): Promise<ExecutionInsight> {
  try {
    if (transaction.executedTxHash) {
      const stored = stores
        ? await findStoredExecutionInsight(stores, transaction)
        : null;
      if (stored) return stored;

      const output = await simulation.replay(
        transaction.safe.chainId,
        transaction.executedTxHash,
      );
      let insight = outputView(
        "executed-replay",
        output,
        transaction.safe.address,
      );
      if (
        transaction.blockHash &&
        output.blockHash.toLowerCase() !== transaction.blockHash.toLowerCase()
      ) {
        insight = {
          ...insight,
          warnings: [
            ...insight.warnings,
            "The replay block hash differs from the persisted transaction; this evidence was not cached.",
          ],
        };
      } else if (stores) {
        await persistExecutionInsight(stores, transaction, output, insight);
      }
      return insight;
    }

    if (transaction.status !== "pending") {
      return unavailable("No mined transaction hash is available for replay.");
    }

    if (transaction.operation === "delegatecall") {
      return unavailable(
        "Delegatecall simulation requires a trace-capable provider.",
      );
    }

    return outputView(
      "direct-call-check",
      await simulation.simulate(
        transaction.safe.chainId,
        {
          from: transaction.safe.address,
          to: transaction.to,
          data: transaction.data,
          value: transaction.value,
        },
        [],
      ),
      transaction.safe.address,
    );
  } catch (error) {
    const message =
      (error instanceof Error ? error.message.split("\n")[0] : String(error)) ??
      "Unknown simulation error.";
    return unavailable(message.slice(0, 240));
  }
}
