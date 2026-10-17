import { describe, expect, it } from "vitest";

import type { DecodedCall } from "../../../src/core/domain";
import type { ExecutionInsight } from "../../../src/lib/api/execution-insight";
import type { TokenMetadataResult } from "../../../src/lib/api/token-metadata";
import { resolveTransactionActionLabel } from "../../../src/lib/transaction-action-label";

const decoded: DecodedCall = {
  method: "add_liquidity",
  parameters: [
    {
      name: "amounts",
      type: "uint256[2]",
      value: '["5418721052300000000000","5968179367"]',
      nestedCalls: [],
    },
    {
      name: "min_mint_amount",
      type: "uint256",
      value: "5681080274688209207555",
      nestedCalls: [],
    },
  ],
  to: null,
  value: null,
  data: null,
  operation: null,
};

const tokenA = "0x1111111111111111111111111111111111111111";
const tokenB = "0x2222222222222222222222222222222222222222";
const lpToken = "0x3333333333333333333333333333333333333333";

const execution = {
  tokenMovements: [
    {
      token: tokenA,
      from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      amount: "5418721052300000000000",
      direction: "outbound" as const,
      logIndex: 1,
    },
    {
      token: tokenB,
      from: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      to: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      amount: "5968179367",
      direction: "outbound" as const,
      logIndex: 2,
    },
    {
      token: lpToken,
      from: "0x0000000000000000000000000000000000000000",
      to: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      amount: "5682000000000000000000",
      direction: "inbound" as const,
      logIndex: 3,
    },
  ],
} satisfies Pick<ExecutionInsight, "tokenMovements">;

const metadata = {
  items: [
    {
      token: tokenA,
      status: "resolved" as const,
      symbol: "WXDC",
      decimals: 18,
      warning: null,
    },
    {
      token: tokenB,
      status: "resolved" as const,
      symbol: "USDC",
      decimals: 6,
      warning: null,
    },
    {
      token: lpToken,
      status: "resolved" as const,
      symbol: "POOL-LP",
      decimals: 18,
      warning: null,
    },
  ],
  totalTokens: 3,
  limited: false,
  blockHash: null,
} satisfies TokenMetadataResult;

describe("transaction action labels", () => {
  it("shows human token amounts for a liquidity deposit", () => {
    expect(
      resolveTransactionActionLabel({
        chainId: 50,
        decoded,
        execution,
        tokenMetadata: metadata,
      }),
    ).toBe(
      "Add liquidity: 5,418.7210523 WXDC + 5,968.179367 USDC (minimum ≈5,681.08027468 LP tokens)",
    );
  });

  it("does not expose raw base units when token evidence is incomplete", () => {
    expect(
      resolveTransactionActionLabel({
        chainId: 50,
        decoded,
        execution: { tokenMovements: [] },
        tokenMetadata: { ...metadata, items: [] },
      }),
    ).toBe("Add liquidity to a pool");
  });
});
