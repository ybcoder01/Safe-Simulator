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

describe("RpcSimulationAdapter", () => {
  it("replays mined transaction outcome, gas, root call, and logs", async () => {
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
    });
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
    const slot =
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;
    const value =
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex;

    const result = await adapter.simulate(
      50,
      { from, to, data: "0x12345678", value: 7n },
      [{ address: to, slots: { [slot]: value } }],
    );

    expect(result.success).toBe(true);
    expect(result.gasUsed).toBe(21_000n);
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
    });
  });
});
