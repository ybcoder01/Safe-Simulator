import type {
  Hex,
  LogEntry,
  SafeTransaction,
  SimulationOutput,
} from "@/core/domain";
import type { SimulationPort } from "@/core/ports";

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
  readonly logs: readonly {
    readonly address: string;
    readonly topics: readonly Hex[];
    readonly data: Hex;
    readonly logIndex: number;
  }[];
  readonly error: string | null;
  readonly coverage: {
    readonly outcome: "on-chain-receipt" | "read-only-call" | "unavailable";
    readonly callTrace: "root-only" | "unavailable";
    readonly eventLogs: "complete" | "unavailable";
    readonly storageDiff: "unavailable";
  };
  readonly warnings: readonly string[];
}

function logsView(logs: readonly LogEntry[]): ExecutionInsight["logs"] {
  return logs.map((log) => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    logIndex: log.logIndex,
  }));
}

function outputView(
  mode: ExecutionInsight["mode"],
  output: SimulationOutput,
): ExecutionInsight {
  const executed = mode === "executed-replay";

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
    logs: logsView(output.logs),
    error: output.error,
    coverage: {
      outcome: executed ? "on-chain-receipt" : "read-only-call",
      callTrace: "root-only",
      eventLogs: executed ? "complete" : "unavailable",
      storageDiff: "unavailable",
    },
    warnings: executed
      ? [
          "Outcome, gas, block, and event logs come from the mined transaction receipt.",
          "This RPC does not expose debug traces; only the outer call is shown.",
          "Storage changes are unavailable until a trace-capable provider is configured.",
        ]
      : [
          "This is a direct read-only call from the Safe address, not a full Safe signature-path simulation.",
          "Event logs and storage changes are not returned by eth_call.",
          "Delegatecall transactions require a trace-capable provider and are not checked here.",
        ],
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
    logs: [],
    error,
    coverage: {
      outcome: "unavailable",
      callTrace: "unavailable",
      eventLogs: "unavailable",
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
): Promise<ExecutionInsight> {
  try {
    if (transaction.executedTxHash) {
      return outputView(
        "executed-replay",
        await simulation.replay(
          transaction.safe.chainId,
          transaction.executedTxHash,
        ),
      );
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
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    return unavailable(message.slice(0, 240));
  }
}
