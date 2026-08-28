import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";

import { RpcSimulationAdapter } from "../../../../src/adapters/simulator-rpc/simulation";
import type { Address, Hex } from "../../../../src/core/domain";

const transactionHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const blockHash =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;
const from = "0x1111111111111111111111111111111111111111" as Address;
const to = "0x2222222222222222222222222222222222222222" as Address;
const token = "0x3333333333333333333333333333333333333333" as Address;
const internalTarget = "0x4444444444444444444444444444444444444444" as Address;
const slot =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
const before =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as Hex;
const after =
  "0x0000000000000000000000000000000000000000000000000000000000000002" as Hex;

function client(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getTransaction: vi.fn().mockResolvedValue({
      from,
      to,
      input: "0x12345678",
      value: 7n,
      blockNumber: 123n,
      blockHash,
    }),
    getTransactionReceipt: vi.fn().mockResolvedValue({
      status: "success",
      gasUsed: 45_000n,
      logs: [
        {
          address: token,
          topics: ["0xfeed"],
          data: "0xbeef",
          logIndex: 3,
        },
      ],
    }),
    getBlock: vi.fn().mockResolvedValue({
      number: 124n,
      hash: blockHash,
    }),
    call: vi.fn().mockResolvedValue({ data: "0x01" }),
    estimateGas: vi.fn().mockResolvedValue(21_000n),
    ...overrides,
  } as unknown as PublicClient;
}

function traceRequest() {
  return vi
    .fn()
    .mockImplementation(
      (_chainId: number, _method: string, params: readonly unknown[]) => {
        const options = params.at(-1) as { tracer?: string };
        if (options.tracer === "callTracer") {
          return Promise.resolve({
            type: "CALL",
            from,
            to,
            input: "0x12345678",
            output: "0x01",
            value: "0x7",
            calls: [
              {
                type: "DELEGATECALL",
                from: to,
                to: internalTarget,
                input: "0xabcdef01",
                output: "0x",
                value: "0x0",
              },
            ],
          });
        }

        return Promise.resolve({
          pre: { [to]: { storage: { [slot]: before } } },
          post: { [to]: { storage: { [slot]: after } } },
        });
      },
    );
}

describe("RpcSimulationAdapter", () => {
  it("replays mined receipt evidence when no trace provider is configured", async () => {
    const adapter = new RpcSimulationAdapter(() => client());

    await expect(adapter.replay(50, transactionHash)).resolves.toEqual({
      success: true,
      gasUsed: 45_000n,
      callTree: {
        from,
        to,
        input: "0x12345678",
        output: null,
        value: 7n,
        operation: "call",
        reverted: false,
        error: null,
        calls: [],
      },
      logs: [
        {
          address: token,
          topics: ["0xfeed"],
          data: "0xbeef",
          logIndex: 3,
        },
      ],
      storageChanges: [],
      blockNumber: 123n,
      blockHash,
      error: null,
      traceCoverage: {
        callTrace: "unavailable",
        storageDiff: "unavailable",
      },
    });
  });

  it("normalizes internal calls and raw storage differences", async () => {
    const request = traceRequest();
    const adapter = new RpcSimulationAdapter(() => client(), request);

    const result = await adapter.replay(50, transactionHash);

    expect(result.traceCoverage).toEqual({
      callTrace: "complete",
      storageDiff: "complete",
    });
    expect(result.callTree.calls).toEqual([
      expect.objectContaining({
        from: to,
        to: internalTarget,
        input: "0xabcdef01",
        operation: "delegatecall",
        reverted: false,
      }),
    ]);
    expect(result.storageChanges).toEqual([
      { address: to, slot, before, after },
    ]);
    expect(request).toHaveBeenCalledWith(
      50,
      "debug_traceTransaction",
      expect.arrayContaining([transactionHash]),
    );
  });

  it("keeps a mined revert explicit", async () => {
    const adapter = new RpcSimulationAdapter(() =>
      client({
        getTransactionReceipt: vi.fn().mockResolvedValue({
          status: "reverted",
          gasUsed: 30_000n,
          logs: [],
        }),
      }),
    );

    const result = await adapter.replay(50, transactionHash);

    expect(result.success).toBe(false);
    expect(result.callTree.reverted).toBe(true);
    expect(result.error).toBe("Transaction reverted on-chain.");
  });

  it("performs a read-only direct call with storage overrides", async () => {
    const rpc = client();
    const adapter = new RpcSimulationAdapter(() => rpc);
    const value =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;

    const result = await adapter.simulate(
      50,
      { from, to, data: "0x12345678", value: 7n },
      [{ address: to, slots: { [slot]: value } }],
    );

    expect(result.success).toBe(true);
    expect(result.gasUsed).toBe(21_000n);
    expect(result.traceCoverage).toEqual({
      callTrace: "unavailable",
      storageDiff: "unavailable",
    });
    expect(rpc.call).toHaveBeenCalledWith(
      expect.objectContaining({
        account: from,
        to,
        data: "0x12345678",
        stateOverride: [
          {
            address: to,
            stateDiff: [{ slot, value }],
          },
        ],
      }),
    );
  });

  it("requests debug trace evidence for direct calls without overrides", async () => {
    const request = traceRequest();
    const adapter = new RpcSimulationAdapter(() => client(), request);

    const result = await adapter.simulate(
      50,
      { from, to, data: "0x12345678", value: 7n },
      [],
      124n,
    );

    expect(result.traceCoverage?.callTrace).toBe("complete");
    expect(request).toHaveBeenCalledWith(
      50,
      "debug_traceCall",
      expect.arrayContaining([
        expect.objectContaining({ from, to, data: "0x12345678" }),
        "0x7c",
      ]),
    );
  });

  it("returns a failed check without inventing gas or logs", async () => {
    const adapter = new RpcSimulationAdapter(() =>
      client({
        call: vi.fn().mockRejectedValue(new Error("execution reverted")),
      }),
    );

    const result = await adapter.simulate(
      50,
      { from, to, data: "0x12345678" },
      [],
    );

    expect(result).toMatchObject({
      success: false,
      gasUsed: null,
      logs: [],
      storageChanges: [],
      error: "execution reverted",
      traceCoverage: {
        callTrace: "unavailable",
        storageDiff: "unavailable",
      },
    });
  });
});
