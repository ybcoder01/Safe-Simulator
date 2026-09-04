import type { Address, Hex, SafeTransaction } from "@/core/domain";
import type { ChainPort } from "@/core/ports";
import type { ExecutionInsight } from "@/lib/api/execution-insight";

const BALANCE_OF_SELECTOR = "0x70a08231";
const BALANCE_WORD = /^0x[0-9a-fA-F]{64,}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const MAX_BALANCE_PAIRS = 12;

export interface TokenBalanceChangeView {
  readonly token: Address;
  readonly account: Address;
  readonly before: string | null;
  readonly after: string | null;
  readonly delta: string | null;
  readonly eventDelta: string;
  readonly status: "exact-blocks" | "projected-events" | "unavailable";
  readonly consistentWithEvents: boolean | null;
  readonly warning: string | null;
}

export interface TokenBalanceChangeResult {
  readonly items: readonly TokenBalanceChangeView[];
  readonly totalPairs: number;
  readonly limited: boolean;
  readonly anchor: {
    readonly type: "exact-blocks" | "latest-state-projection" | "unavailable";
    readonly beforeBlock: string | null;
    readonly afterBlock: string | null;
  };
  readonly warnings: readonly string[];
}

interface BalancePair {
  readonly token: Address;
  readonly account: Address;
  readonly eventDelta: bigint;
}

function normalizedAddress(value: string): Address | null {
  return ADDRESS.test(value) ? (value.toLowerCase() as Address) : null;
}

function pairKey(token: Address, account: Address) {
  return `${token.toLowerCase()}:${account.toLowerCase()}`;
}

function balanceData(account: Address): Hex {
  return (BALANCE_OF_SELECTOR +
    account.slice(2).toLowerCase().padStart(64, "0")) as Hex;
}

function decodedBalance(value: Hex): bigint | null {
  if (!BALANCE_WORD.test(value)) return null;
  try {
    return BigInt(`0x${value.slice(2, 66)}`);
  } catch {
    return null;
  }
}

function affectedPairs(
  execution: Pick<ExecutionInsight, "tokenMovements">,
): readonly BalancePair[] {
  const pairs = new Map<string, BalancePair>();
  const add = (tokenValue: string, accountValue: string, delta: bigint) => {
    const token = normalizedAddress(tokenValue);
    const account = normalizedAddress(accountValue);
    if (!token || !account || account === ZERO_ADDRESS) return;
    const key = pairKey(token, account);
    const current = pairs.get(key);
    pairs.set(key, {
      token,
      account,
      eventDelta: (current?.eventDelta ?? 0n) + delta,
    });
  };

  for (const movement of execution.tokenMovements) {
    let amount: bigint;
    try {
      amount = BigInt(movement.amount);
    } catch {
      continue;
    }
    add(movement.token, movement.from, -amount);
    add(movement.token, movement.to, amount);
  }
  return [...pairs.values()];
}

async function readBalance(
  chain: Pick<ChainPort, "call">,
  chainId: number,
  pair: BalancePair,
  blockNumber?: bigint,
): Promise<bigint | null> {
  try {
    return decodedBalance(
      await chain.call(
        chainId,
        { to: pair.token, data: balanceData(pair.account) },
        blockNumber,
      ),
    );
  } catch {
    return null;
  }
}

function unavailableItem(
  pair: BalancePair,
  warning: string,
): TokenBalanceChangeView {
  return {
    ...pair,
    eventDelta: pair.eventDelta.toString(),
    before: null,
    after: null,
    delta: null,
    status: "unavailable",
    consistentWithEvents: null,
    warning,
  };
}

export async function resolveTokenBalanceChanges(
  chain: Pick<ChainPort, "call">,
  transaction: Pick<SafeTransaction, "safe" | "status">,
  execution: Pick<ExecutionInsight, "blockNumber" | "tokenMovements">,
): Promise<TokenBalanceChangeResult> {
  const pairs = affectedPairs(execution);
  const selected = pairs.slice(0, MAX_BALANCE_PAIRS);
  const limited = pairs.length > selected.length;
  const commonWarnings = limited
    ? [
        `Balance evidence is limited to ${MAX_BALANCE_PAIRS} token-account pairs; additional affected accounts remain unenriched.`,
      ]
    : [];

  if (transaction.status === "executed" && execution.blockNumber !== null) {
    let afterBlock: bigint;
    try {
      afterBlock = BigInt(execution.blockNumber);
    } catch {
      return {
        items: selected.map((pair) =>
          unavailableItem(pair, "The execution block number is malformed."),
        ),
        totalPairs: pairs.length,
        limited,
        anchor: {
          type: "unavailable",
          beforeBlock: null,
          afterBlock: null,
        },
        warnings: [
          ...commonWarnings,
          "Exact balance evidence requires a valid mined block anchor.",
        ],
      };
    }
    if (afterBlock === 0n) {
      return {
        items: selected.map((pair) =>
          unavailableItem(pair, "No previous block exists for comparison."),
        ),
        totalPairs: pairs.length,
        limited,
        anchor: {
          type: "unavailable",
          beforeBlock: null,
          afterBlock: "0",
        },
        warnings: [
          ...commonWarnings,
          "Exact balance evidence requires a previous block.",
        ],
      };
    }

    const beforeBlock = afterBlock - 1n;
    const items = await Promise.all(
      selected.map(async (pair): Promise<TokenBalanceChangeView> => {
        const [before, after] = await Promise.all([
          readBalance(chain, transaction.safe.chainId, pair, beforeBlock),
          readBalance(chain, transaction.safe.chainId, pair, afterBlock),
        ]);
        if (before === null || after === null) {
          return unavailableItem(
            pair,
            "One or both block-anchored balance reads were unavailable.",
          );
        }
        const delta = after - before;
        const consistentWithEvents = delta === pair.eventDelta;
        return {
          ...pair,
          eventDelta: pair.eventDelta.toString(),
          before: before.toString(),
          after: after.toString(),
          delta: delta.toString(),
          status: "exact-blocks",
          consistentWithEvents,
          warning: consistentWithEvents
            ? null
            : "The exact balance delta differs from canonical Transfer-event evidence. Review token mechanics and trace coverage.",
        };
      }),
    );
    return {
      items,
      totalPairs: pairs.length,
      limited,
      anchor: {
        type: "exact-blocks",
        beforeBlock: beforeBlock.toString(),
        afterBlock: afterBlock.toString(),
      },
      warnings: [
        ...commonWarnings,
        "Exact values come from read-only balanceOf calls at the previous and execution blocks.",
      ],
    };
  }

  if (transaction.status === "pending") {
    const items = await Promise.all(
      selected.map(async (pair): Promise<TokenBalanceChangeView> => {
        const before = await readBalance(
          chain,
          transaction.safe.chainId,
          pair,
        );
        if (before === null) {
          return unavailableItem(
            pair,
            "The latest-state balance could not be read.",
          );
        }
        const projected = before + pair.eventDelta;
        if (projected < 0n) {
          return unavailableItem(
            pair,
            "The event-derived delta would produce a negative balance, so no projection is shown.",
          );
        }
        return {
          ...pair,
          eventDelta: pair.eventDelta.toString(),
          before: before.toString(),
          after: projected.toString(),
          delta: pair.eventDelta.toString(),
          status: "projected-events",
          consistentWithEvents: null,
          warning:
            "The after value is a projection from simulated Transfer-shaped events and latest state, not mined evidence.",
        };
      }),
    );
    return {
      items,
      totalPairs: pairs.length,
      limited,
      anchor: {
        type: "latest-state-projection",
        beforeBlock: null,
        afterBlock: null,
      },
      warnings: [
        ...commonWarnings,
        "Pending balances can change before execution and remain projections until mined.",
      ],
    };
  }

  return {
    items: selected.map((pair) =>
      unavailableItem(pair, "No usable execution state anchor is available."),
    ),
    totalPairs: pairs.length,
    limited,
    anchor: { type: "unavailable", beforeBlock: null, afterBlock: null },
    warnings: [
      ...commonWarnings,
      "Token balance evidence is unavailable without a pending or mined execution anchor.",
    ],
  };
}
