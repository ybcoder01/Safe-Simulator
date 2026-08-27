import { describe, expect, it, vi } from "vitest";

import {
  ERC20_APPROVAL_TOPIC,
  ERC20_TRANSFER_TOPIC,
} from "../../../../src/core/analysis/tokens/event-facts";
import type {
  Address,
  Hex,
  SafeTransaction,
  SimulationOutput,
} from "../../../../src/core/domain";
import type { SimulationPort } from "../../../../src/core/ports";
import { resolveExecutionInsight } from "../../../../src/lib/api/execution-insight";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const token = "0x3333333333333333333333333333333333333333" as Address;
const counterparty = "0x4444444444444444444444444444444444444444" as Address;
const spender = "0x5555555555555555555555555555555555555555" as Address;
const maxUint256 = (1n << 256n) - 1n;

function addressTopic(address: Address): Hex {
  return `0x${"0".repeat(24)}${address.slice(2)}` as Hex;
}

function word(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}
const safeTxHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const executedTxHash =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
const blockHash =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Hex;

function transaction(
  overrides: Partial<SafeTransaction> = {},
): SafeTransaction {
  return {
    safe: { chainId: 50, address: safe },
    safeTxHash,
    nonce: 1n,
    to: target,
    value: 0n,
    data: "0x12345678",
    operation: "call",
    status: "executed",
    confirmations: [],
    proposedAt: 1,
    executedAt: 2,
    executedTxHash,
    blockNumber: 10n,
    blockHash,
    ...overrides,
  };
}

const output: SimulationOutput = {
  success: true,
  gasUsed: 50_000n,
  callTree: {
    from: safe,
    to: target,
    input: "0x12345678",
    output: null,
    value: 0n,
    operation: "call",
    reverted: false,
    error: null,
    calls: [],
  },
  logs: [
    {
      address: token,
      topics: [
        ERC20_TRANSFER_TOPIC,
        addressTopic(safe),
        addressTopic(counterparty),
      ],
      data: word(25n),
      logIndex: 1,
    },
    {
      address: token,
      topics: [ERC20_APPROVAL_TOPIC, addressTopic(safe), addressTopic(spender)],
      data: word(maxUint256),
      logIndex: 2,
    },
  ],
  storageChanges: [],
  blockNumber: 10n,
  blockHash,
  error: null,
};

function simulation(overrides: Partial<SimulationPort> = {}): SimulationPort {
  return {
    replay: vi.fn().mockResolvedValue(output),
    simulate: vi.fn().mockResolvedValue(output),
    ...overrides,
  };
}

describe("resolveExecutionInsight", () => {
  it("labels mined receipt replay and serializes bigint values", async () => {
    const result = await resolveExecutionInsight(simulation(), transaction());

    expect(result).toMatchObject({
      mode: "executed-replay",
      success: true,
      gasUsed: "50000",
      blockNumber: "10",
      coverage: {
        outcome: "on-chain-receipt",
        callTrace: "root-only",
        eventLogs: "complete",
        tokenEvents: "standard-events",
        storageDiff: "unavailable",
      },
    });
    expect(result.tokenMovements).toEqual([
      {
        token,
        from: safe,
        to: counterparty,
        amount: "25",
        direction: "outbound",
        logIndex: 1,
      },
    ]);
    expect(result.allowanceChanges[0]).toEqual({
      token,
      owner: safe,
      spender,
      amount: maxUint256.toString(),
      infinite: true,
      logIndex: 2,
    });
  });

  it("uses a direct call only for pending call operations", async () => {
    const port = simulation();
    const pending = transaction({
      status: "pending",
      executedAt: null,
      executedTxHash: null,
      blockNumber: null,
      blockHash: null,
    });

    const result = await resolveExecutionInsight(port, pending);

    expect(result.mode).toBe("direct-call-check");
    expect(port.simulate).toHaveBeenCalledWith(
      50,
      {
        from: safe,
        to: target,
        data: "0x12345678",
        value: 0n,
      },
      [],
    );
  });

  it("does not approximate pending delegatecall behavior", async () => {
    const port = simulation();
    const pending = transaction({
      status: "pending",
      operation: "delegatecall",
      executedAt: null,
      executedTxHash: null,
      blockNumber: null,
      blockHash: null,
    });

    const result = await resolveExecutionInsight(port, pending);

    expect(result.mode).toBe("unavailable");
    expect(result.success).toBeNull();
    expect(result.error).toContain("trace-capable");
    expect(port.simulate).not.toHaveBeenCalled();
  });

  it("degrades provider failures to an explicit unavailable result", async () => {
    const result = await resolveExecutionInsight(
      simulation({
        replay: vi.fn().mockRejectedValue(new Error("receipt unavailable")),
      }),
      transaction(),
    );

    expect(result).toMatchObject({
      mode: "unavailable",
      success: null,
      error: "receipt unavailable",
    });
  });
});
