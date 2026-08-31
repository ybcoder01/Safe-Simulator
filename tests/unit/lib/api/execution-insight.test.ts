import { decodeFunctionData } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  ERC20_APPROVAL_TOPIC,
  ERC20_TRANSFER_TOPIC,
} from "../../../../src/core/analysis/tokens/event-facts";
import type {
  Address,
  Hex,
  SafeExecutionPayload,
  SafeSnapshot,
  SafeTransaction,
  SimulationOutput,
} from "../../../../src/core/domain";
import type { SimulationPort } from "../../../../src/core/ports";
import {
  EXECUTION_EVIDENCE_ENGINE_VERSION,
  resolveExecutionInsight,
  type ExecutionEvidenceStores,
  type PendingExecutionSources,
} from "../../../../src/lib/api/execution-insight";
import { safeExecutionAbi } from "../../../../src/lib/api/safe-execution";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const token = "0x3333333333333333333333333333333333333333" as Address;
const counterparty = "0x4444444444444444444444444444444444444444" as Address;
const spender = "0x5555555555555555555555555555555555555555" as Address;
const implementation = "0x6666666666666666666666666666666666666666" as Address;
const owner = "0x7777777777777777777777777777777777777777" as Address;
const ownerSignature = `0x${"11".repeat(64)}1b` as Hex;
const maxUint256 = (1n << 256n) - 1n;

function addressTopic(address: Address): Hex {
  return ("0x" + "0".repeat(24) + address.slice(2)) as Hex;
}

function word(value: bigint): Hex {
  return ("0x" + value.toString(16).padStart(64, "0")) as Hex;
}
const safeTxHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const executedTxHash =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
const blockHash =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as Hex;
const slot =
  "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as Hex;

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
    calls: [
      {
        from: target,
        to: implementation,
        input: "0xabcdef01",
        output: "0x",
        value: 0n,
        operation: "delegatecall",
        reverted: false,
        error: null,
        calls: [],
      },
    ],
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
  storageChanges: [
    {
      address: target,
      slot,
      before: word(1n),
      after: word(2n),
    },
  ],
  blockNumber: 10n,
  blockHash,
  error: null,
  traceCoverage: {
    callTrace: "complete",
    storageDiff: "complete",
  },
};

function simulation(overrides: Partial<SimulationPort> = {}): SimulationPort {
  return {
    replay: vi.fn().mockResolvedValue(output),
    simulate: vi.fn().mockResolvedValue(output),
    ...overrides,
  };
}

function pendingSources(
  pending: SafeTransaction,
  overrides: {
    readonly payload?: SafeExecutionPayload | null;
    readonly snapshot?: SafeSnapshot;
  } = {},
): PendingExecutionSources {
  const payload =
    overrides.payload === undefined
      ? {
          safe: pending.safe,
          safeTxHash: pending.safeTxHash,
          nonce: pending.nonce,
          to: pending.to,
          value: pending.value,
          data: pending.data,
          operation: pending.operation,
          safeTxGas: 0n,
          baseGas: 0n,
          gasPrice: 0n,
          gasToken: null,
          refundReceiver: null,
          confirmations: [{ owner, signature: ownerSignature, signedAt: 1 }],
        }
      : overrides.payload;
  const snapshot = overrides.snapshot ?? {
    ...pending.safe,
    owners: [owner],
    threshold: 1,
    nonce: pending.nonce,
    version: "1.4.1",
    guard: null,
    modules: [],
    implementation: null,
    observedAt: 1,
  };

  return {
    safeData: {
      getMultisigTransaction: vi.fn().mockResolvedValue(payload),
    },
    chain: {
      getSafeSnapshot: vi.fn().mockResolvedValue(snapshot),
      getTransactionBlock: vi.fn().mockResolvedValue({
        blockNumber: 10n,
        blockHash,
      }),
    },
  };
}

function evidenceStores(initialRecord: unknown = null) {
  const values = new Map<string, unknown>();
  const get = vi.fn(async (key: string) => values.get(key) ?? null);
  const set = vi.fn(async (key: string, value: unknown) => {
    values.set(key, value);
  });
  const findExecutionEvidence = vi.fn().mockResolvedValue(initialRecord);
  const saveExecutionEvidence = vi.fn().mockResolvedValue(undefined);

  return {
    stores: {
      cache: { get, set },
      persistence: { findExecutionEvidence, saveExecutionEvidence },
    } as unknown as ExecutionEvidenceStores,
    values,
    get,
    set,
    findExecutionEvidence,
    saveExecutionEvidence,
  };
}

describe("resolveExecutionInsight", () => {
  it("serializes receipt, internal-call, storage, and token evidence", async () => {
    const result = await resolveExecutionInsight(simulation(), transaction());

    expect(result).toMatchObject({
      mode: "executed-replay",
      success: true,
      gasUsed: "50000",
      blockNumber: "10",
      coverage: {
        outcome: "on-chain-receipt",
        callTrace: "complete",
        eventLogs: "complete",
        tokenEvents: "standard-events",
        storageDiff: "complete",
      },
    });
    expect(result.internalCalls).toEqual([
      {
        depth: 1,
        from: target,
        to: implementation,
        input: "0xabcdef01",
        value: "0",
        operation: "delegatecall",
        reverted: false,
        error: null,
      },
    ]);
    expect(result.storageChanges).toEqual([
      {
        address: target,
        slot,
        before: word(1n),
        after: word(2n),
      },
    ]);
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

  it("keeps legacy or degraded outputs explicitly root-only", async () => {
    const degraded = {
      ...output,
      callTree: { ...output.callTree, calls: [] },
      storageChanges: [],
      traceCoverage: undefined,
    };

    const result = await resolveExecutionInsight(
      simulation({ replay: vi.fn().mockResolvedValue(degraded) }),
      transaction(),
    );

    expect(result.coverage.callTrace).toBe("root-only");
    expect(result.coverage.storageDiff).toBe("unavailable");
    expect(result.internalCalls).toEqual([]);
    expect(result.storageChanges).toEqual([]);
  });

  it("simulates a threshold-confirmed pending transaction through execTransaction", async () => {
    const port = simulation();
    const pending = transaction({
      status: "pending",
      executedAt: null,
      executedTxHash: null,
      blockNumber: null,
      blockHash: null,
    });

    const result = await resolveExecutionInsight(
      port,
      pending,
      undefined,
      pendingSources(pending),
    );

    expect(result.mode).toBe("safe-execution-check");
    expect(result.warnings).toContain(
      "Pending execution evidence uses latest state and can change before the transaction is mined.",
    );
    expect(port.simulate).toHaveBeenCalledTimes(1);
    const [, request, overrides] = vi.mocked(port.simulate).mock.calls[0]!;
    expect(request).toMatchObject({ from: owner, to: safe, value: 0n });
    expect(overrides).toEqual([]);
    expect(
      decodeFunctionData({ abi: safeExecutionAbi, data: request.data }),
    ).toMatchObject({
      functionName: "execTransaction",
      args: expect.arrayContaining([target, 0n, "0x12345678", 0]),
    });
  });

  it("does not approximate pending execution without enough supported signatures", async () => {
    const port = simulation();
    const pending = transaction({
      status: "pending",
      operation: "delegatecall",
      executedAt: null,
      executedTxHash: null,
      blockNumber: null,
      blockHash: null,
    });
    const validPayload: SafeExecutionPayload = {
      safe: pending.safe,
      safeTxHash: pending.safeTxHash,
      nonce: pending.nonce,
      to: pending.to,
      value: pending.value,
      data: pending.data,
      operation: pending.operation,
      safeTxGas: 0n,
      baseGas: 0n,
      gasPrice: 0n,
      gasToken: null,
      refundReceiver: null,
      confirmations: [{ owner, signature: ownerSignature, signedAt: 1 }],
    };
    const incompleteSources = pendingSources(pending, {
      payload: validPayload,
      snapshot: {
        ...pending.safe,
        owners: [owner],
        threshold: 2,
        nonce: pending.nonce,
        version: "1.4.1",
        guard: null,
        modules: [],
        implementation: null,
        observedAt: 1,
      },
    });

    const result = await resolveExecutionInsight(
      port,
      pending,
      undefined,
      incompleteSources,
    );

    expect(result.mode).toBe("unavailable");
    expect(result.success).toBeNull();
    expect(result.error).toContain("current threshold");
    expect(port.simulate).not.toHaveBeenCalled();
  });

  it("persists complete executed evidence and reuses the Redis projection", async () => {
    const port = simulation();
    const state = evidenceStores();

    const first = await resolveExecutionInsight(
      port,
      transaction(),
      state.stores,
    );
    const second = await resolveExecutionInsight(
      port,
      transaction(),
      state.stores,
    );

    expect(first.coverage.callTrace).toBe("complete");
    expect(second).toEqual(first);
    expect(port.replay).toHaveBeenCalledTimes(1);
    expect(state.saveExecutionEvidence).toHaveBeenCalledTimes(1);
    expect(state.saveExecutionEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        engineVersion: EXECUTION_EVIDENCE_ENGINE_VERSION,
        blockHash,
        simulation: output,
      }),
    );
    expect(state.set).toHaveBeenCalledWith(
      expect.stringContaining(EXECUTION_EVIDENCE_ENGINE_VERSION),
      expect.any(Object),
      null,
    );
  });

  it("anchors complete evidence when the persisted block hash is missing", async () => {
    const state = evidenceStores();

    await resolveExecutionInsight(
      simulation(),
      transaction({ blockHash: null }),
      state.stores,
    );

    expect(state.saveExecutionEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ blockHash }),
    );
    expect(state.set).toHaveBeenCalledWith(
      expect.stringContaining(blockHash),
      expect.any(Object),
      null,
    );
  });

  it("rehydrates complete PostgreSQL evidence without replaying", async () => {
    const state = evidenceStores({
      safe: transaction().safe,
      safeTxHash,
      engineVersion: EXECUTION_EVIDENCE_ENGINE_VERSION,
      blockHash,
      simulation: output,
      createdAt: 1,
    });
    const port = simulation({ replay: vi.fn() });

    const result = await resolveExecutionInsight(
      port,
      transaction(),
      state.stores,
    );

    expect(result.coverage.callTrace).toBe("complete");
    expect(port.replay).not.toHaveBeenCalled();
    expect(state.set).toHaveBeenCalledTimes(1);
  });

  it("bypasses stale evidence and replays the canonical receipt after a reorganization", async () => {
    const changedBlockHash =
      "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Hex;
    const changedOutput: SimulationOutput = {
      ...output,
      blockNumber: 11n,
      blockHash: changedBlockHash,
    };
    const state = evidenceStores({
      safe: transaction().safe,
      safeTxHash,
      engineVersion: EXECUTION_EVIDENCE_ENGINE_VERSION,
      blockHash,
      simulation: output,
      createdAt: 1,
    });
    const sources = pendingSources(transaction());
    vi.mocked(sources.chain.getTransactionBlock).mockResolvedValue({
      blockNumber: 11n,
      blockHash: changedBlockHash,
    });
    const port = simulation({
      replay: vi.fn().mockResolvedValue(changedOutput),
    });

    const result = await resolveExecutionInsight(
      port,
      transaction(),
      state.stores,
      sources,
    );

    expect(state.findExecutionEvidence).not.toHaveBeenCalled();
    expect(port.replay).toHaveBeenCalledTimes(1);
    expect(state.saveExecutionEvidence).not.toHaveBeenCalled();
    expect(result.blockHash).toBe(changedBlockHash);
    expect(result.warnings).toContain(
      "The stored block anchor is no longer canonical. Cached evidence was bypassed and the current receipt was replayed; persistence will refresh during synchronization.",
    );
  });

  it("does not retain partial trace evidence indefinitely", async () => {
    const partial: SimulationOutput = {
      ...output,
      traceCoverage: {
        callTrace: "partial",
        storageDiff: "complete",
      },
    };
    const state = evidenceStores();

    const result = await resolveExecutionInsight(
      simulation({ replay: vi.fn().mockResolvedValue(partial) }),
      transaction(),
      state.stores,
    );

    expect(result.coverage.callTrace).toBe("partial");
    expect(state.saveExecutionEvidence).not.toHaveBeenCalled();
    expect(state.set).not.toHaveBeenCalled();
  });

  it("does not cache evidence from a different block hash", async () => {
    const changedBlockHash =
      "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Hex;
    const state = evidenceStores();

    const result = await resolveExecutionInsight(
      simulation({
        replay: vi
          .fn()
          .mockResolvedValue({ ...output, blockHash: changedBlockHash }),
      }),
      transaction(),
      state.stores,
    );

    expect(result.warnings).toContain(
      "The replay block hash differs from the canonical transaction anchor; this evidence was not cached.",
    );
    expect(state.saveExecutionEvidence).not.toHaveBeenCalled();
    expect(state.set).not.toHaveBeenCalled();
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
