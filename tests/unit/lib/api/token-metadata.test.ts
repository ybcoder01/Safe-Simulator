import { describe, expect, it, vi } from "vitest";

import {
  ERC20_DECIMALS_SELECTOR,
  ERC20_SYMBOL_SELECTOR,
} from "../../../../src/core/analysis/tokens/metadata";
import type { Address, Hex } from "../../../../src/core/domain";
import {
  resolveTokenMetadata,
  type TokenMetadataView,
} from "../../../../src/lib/api/token-metadata";

const token = "0x1111111111111111111111111111111111111111" as Address;
const blockHash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

function word(value: bigint): Hex {
  return (`0x${value.toString(16).padStart(64, "0")}`) as Hex;
}

function symbol(value: string): Hex {
  const body = Array.from(value)
    .map((character) => character.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
  return (
    `0x${32n.toString(16).padStart(64, "0")}${BigInt(value.length)
      .toString(16)
      .padStart(64, "0")}${body.padEnd(64, "0")}`
  ) as Hex;
}

function chain() {
  return {
    call: vi.fn(async (_chainId, request) => {
      if (request.data === ERC20_DECIMALS_SELECTOR) return word(6n);
      if (request.data === ERC20_SYMBOL_SELECTOR) return symbol("USDC");
      throw new Error("unexpected selector");
    }),
  };
}

function cache(initial: TokenMetadataView | null = null) {
  return {
    get: vi.fn().mockResolvedValue(initial),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

describe("resolveTokenMetadata", () => {
  it("reads, validates, and permanently caches block-anchored metadata", async () => {
    const chainPort = chain();
    const cachePort = cache();

    const result = await resolveTokenMetadata(chainPort, cachePort, {
      chainId: 50,
      tokens: [token, token],
      blockNumber: 10n,
      blockHash,
    });

    expect(result).toEqual({
      items: [
        {
          token,
          status: "resolved",
          symbol: "USDC",
          decimals: 6,
          warning: null,
        },
      ],
      totalTokens: 1,
      limited: false,
      blockHash,
    });
    expect(chainPort.call).toHaveBeenCalledTimes(2);
    expect(chainPort.call).toHaveBeenCalledWith(
      50,
      { to: token, data: ERC20_DECIMALS_SELECTOR },
      10n,
    );
    expect(cachePort.set).toHaveBeenCalledWith(
      expect.stringContaining(blockHash),
      result.items[0],
      null,
    );
  });

  it("uses a short TTL for latest-state metadata", async () => {
    const cachePort = cache();

    await resolveTokenMetadata(chain(), cachePort, {
      chainId: 50,
      tokens: [token],
      blockNumber: null,
      blockHash: null,
    });

    expect(cachePort.set).toHaveBeenCalledWith(
      expect.stringContaining("latest"),
      expect.objectContaining({ status: "resolved" }),
      3_600,
    );
  });

  it("reuses a valid cache projection without RPC calls", async () => {
    const cached: TokenMetadataView = {
      token,
      status: "resolved",
      symbol: "USDC",
      decimals: 6,
      warning: null,
    };
    const chainPort = chain();

    const result = await resolveTokenMetadata(chainPort, cache(cached), {
      chainId: 50,
      tokens: [token],
      blockNumber: 10n,
      blockHash,
    });

    expect(result.items).toEqual([cached]);
    expect(chainPort.call).not.toHaveBeenCalled();
  });

  it("marks malformed metadata and keeps raw units authoritative", async () => {
    const chainPort = {
      call: vi.fn(async (_chainId: number, request: { data: Hex }) =>
        request.data === ERC20_DECIMALS_SELECTOR
          ? word(255n)
          : symbol("TOKEN"),
      ),
    };
    const cachePort = cache();

    const result = await resolveTokenMetadata(chainPort, cachePort, {
      chainId: 50,
      tokens: [token],
      blockNumber: 10n,
      blockHash,
    });

    expect(result.items[0]).toMatchObject({
      status: "malformed",
      symbol: "TOKEN",
      decimals: null,
    });
    expect(result.items[0]?.warning).toContain("raw base units");
    expect(cachePort.set).toHaveBeenCalledTimes(1);
  });

  it("does not cache partial metadata caused by a read failure", async () => {
    const chainPort = {
      call: vi.fn(async (_chainId: number, request: { data: Hex }) => {
        if (request.data === ERC20_DECIMALS_SELECTOR) return word(18n);
        throw new Error("symbol read failed");
      }),
    };
    const cachePort = cache();

    const result = await resolveTokenMetadata(chainPort, cachePort, {
      chainId: 50,
      tokens: [token],
      blockNumber: 10n,
      blockHash,
    });

    expect(result.items[0]).toMatchObject({
      status: "partial",
      decimals: 18,
      symbol: null,
    });
    expect(cachePort.set).not.toHaveBeenCalled();
  });
});
