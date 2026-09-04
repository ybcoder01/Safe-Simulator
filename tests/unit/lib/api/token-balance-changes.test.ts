import { describe, expect, it, vi } from "vitest";

import type { Address, Hex, SafeTransaction } from "../../../../src/core/domain";
import type { ExecutionInsight } from "../../../../src/lib/api/execution-insight";
import { resolveTokenBalanceChanges } from "../../../../src/lib/api/token-balance-changes";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const recipient = "0x3333333333333333333333333333333333333333" as Address;

function word(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function transaction(status: SafeTransaction["status"]) {
  return {
    safe: { chainId: 50, address: safe },
    status,
  } as const;
}

function execution(
  status: SafeTransaction["status"],
  amount = "100",
): Pick<ExecutionInsight, "blockNumber" | "tokenMovements"> {
  return {
    blockNumber: status === "executed" ? "20" : "21",
    tokenMovements: [
      {
        token,
        from: safe,
        to: recipient,
        amount,
        direction: "outbound",
        logIndex: 1,
      },
    ],
  };
}

describe("resolveTokenBalanceChanges", () => {
  it("compares exact balances at the previous and execution blocks", async () => {
    const chain = {
      call: vi.fn(
        async (
          _chainId: number,
          request: { readonly data: Hex },
          block?: bigint,
        ) => {
          const account = `0x${request.data.slice(-40)}`.toLowerCase();
          if (account === safe.toLowerCase()) {
            return word(block === 19n ? 1000n : 900n);
          }
          return word(block === 19n ? 10n : 110n);
        },
      ),
    };

    const result = await resolveTokenBalanceChanges(
      chain,
      transaction("executed"),
      execution("executed"),
    );

    expect(result.anchor).toEqual({
      type: "exact-blocks",
      beforeBlock: "19",
      afterBlock: "20",
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        account: safe,
        before: "1000",
        after: "900",
        delta: "-100",
        eventDelta: "-100",
        status: "exact-blocks",
        consistentWithEvents: true,
      }),
      expect.objectContaining({
        account: recipient,
        before: "10",
        after: "110",
        delta: "100",
        eventDelta: "100",
        status: "exact-blocks",
        consistentWithEvents: true,
      }),
    ]);
    expect(chain.call).toHaveBeenCalledTimes(4);
  });

  it("surfaces disagreement between balance deltas and events", async () => {
    const chain = {
      call: vi.fn(
        async (
          _chainId: number,
          request: { readonly data: Hex },
          block?: bigint,
        ) => {
          const account = `0x${request.data.slice(-40)}`.toLowerCase();
          if (account === safe.toLowerCase()) {
            return word(block === 19n ? 1000n : 850n);
          }
          return word(block === 19n ? 10n : 110n);
        },
      ),
    };

    const result = await resolveTokenBalanceChanges(
      chain,
      transaction("executed"),
      execution("executed"),
    );

    expect(result.items[0]).toMatchObject({
      delta: "-150",
      eventDelta: "-100",
      consistentWithEvents: false,
    });
    expect(result.items[0]?.warning).toContain("differs");
  });

  it("labels pending after-balances as event projections", async () => {
    const chain = {
      call: vi.fn(async (_chainId: number, request: { readonly data: Hex }) => {
        const account = `0x${request.data.slice(-40)}`.toLowerCase();
        return word(account === safe.toLowerCase() ? 1000n : 10n);
      }),
    };

    const result = await resolveTokenBalanceChanges(
      chain,
      transaction("pending"),
      execution("pending"),
    );

    expect(result.anchor.type).toBe("latest-state-projection");
    expect(result.items[0]).toMatchObject({
      before: "1000",
      after: "900",
      delta: "-100",
      status: "projected-events",
      consistentWithEvents: null,
    });
    expect(result.items[0]?.warning).toContain("projection");
  });

  it("keeps unreadable balances explicitly unavailable", async () => {
    const chain = {
      call: vi.fn().mockRejectedValue(new Error("unavailable")),
    };

    const result = await resolveTokenBalanceChanges(
      chain,
      transaction("executed"),
      execution("executed"),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        account: safe,
        status: "unavailable",
        before: null,
        after: null,
      }),
      expect.objectContaining({
        account: recipient,
        status: "unavailable",
        before: null,
        after: null,
      }),
    ]);
  });
});
