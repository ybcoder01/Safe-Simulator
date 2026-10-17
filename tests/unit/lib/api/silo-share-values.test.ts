import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  getAddress,
  parseAbi,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";

import type { Address } from "@/core/domain";
import {
  attestedSiloMarkets,
  resolveSiloShareValues,
} from "@/lib/api/silo-share-values";

const market = "0x9EbC79a0d5c6A2CB8C294da02F6675cD3F42d677" as Address;
const siloConfig = "0x0d419DC8128D5738a62753DeB8eA3508AEd95253" as Address;
const protectedShare = getAddress(
  "0xfc4e94421714b0eaa911f44c614c6ef34340954e",
) as Address;
const collateralShare = "0x1111111111111111111111111111111111111111" as Address;
const asset = "0x951857744785E80e2De051c32EE7b25f9c458C42" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const zero = "0x0000000000000000000000000000000000000000" as Address;

const abi = parseAbi([
  "function silo() view returns (address)",
  "function config() view returns (address)",
  "function convertToAssets(uint256 shares, uint8 collateralType) view returns (uint256)",
  "function getConfig(address silo) view returns ((uint256 daoFee,uint256 deployerFee,address silo,address token,address protectedShareToken,address collateralShareToken,address debtShareToken,address solvencyOracle,address maxLtvOracle,address interestRateModel,uint256 maxLtv,uint256 lt,uint256 liquidationTargetLtv,uint256 liquidationFee,uint256 flashloanFee,address hookReceiver,bool callBeforeQuote) config)",
]);

const SYMBOL = "0x95d89b41";
const DECIMALS = "0x313ce567";

function word(value: bigint): Hex {
  return encodeAbiParameters([{ type: "uint256" }], [value]);
}

function textWord(value: string): Hex {
  return encodeAbiParameters([{ type: "string" }], [value]);
}

interface Options {
  readonly shareSilo?: Address;
  readonly typesSeen?: number[];
}

function fakeChain(options: Options = {}) {
  return {
    async call(
      _chainId: number,
      request: { to: string; data: Hex },
    ): Promise<Hex> {
      const to = request.to.toLowerCase();
      if (request.data === SYMBOL) return textWord("WXDC");
      if (request.data === DECIMALS) return word(18n);
      const { functionName, args } = decodeFunctionData({
        abi,
        data: request.data,
      });
      if (functionName === "silo") {
        return encodeFunctionResult({
          abi,
          functionName: "silo",
          result: options.shareSilo ?? market,
        });
      }
      if (functionName === "config") {
        return encodeFunctionResult({
          abi,
          functionName: "config",
          result: siloConfig,
        });
      }
      if (functionName === "getConfig") {
        return encodeFunctionResult({
          abi,
          functionName: "getConfig",
          result: {
            daoFee: 0n,
            deployerFee: 0n,
            silo: market,
            token: asset,
            protectedShareToken: protectedShare,
            collateralShareToken: collateralShare,
            debtShareToken: zero,
            solvencyOracle: zero,
            maxLtvOracle: zero,
            interestRateModel: zero,
            maxLtv: 0n,
            lt: 0n,
            liquidationTargetLtv: 0n,
            liquidationFee: 0n,
            flashloanFee: 0n,
            hookReceiver: zero,
            callBeforeQuote: false,
          },
        });
      }
      expect(to).toBe(market.toLowerCase());
      const [shares, type] = args as readonly [bigint, number];
      options.typesSeen?.push(type);
      return word(shares / 1000n);
    },
  };
}

const movements = [
  {
    logIndex: 3,
    token: protectedShare,
    amount: "2000000000000000000000000000",
  },
];

describe("resolveSiloShareValues", () => {
  it("values a protected share token through its attested market", async () => {
    const typesSeen: number[] = [];
    const values = await resolveSiloShareValues(fakeChain({ typesSeen }), {
      chainId: 50,
      markets: [market],
      movements,
      blockNumber: 1n,
    });

    expect(values.get(3)).toEqual({ amount: "2,000,000", symbol: "WXDC" });
    expect(typesSeen).toEqual([0]);
  });

  it("uses the collateral type for a collateral share token", async () => {
    const typesSeen: number[] = [];
    const values = await resolveSiloShareValues(fakeChain({ typesSeen }), {
      chainId: 50,
      markets: [market],
      movements: [{ ...movements[0]!, token: collateralShare }],
      blockNumber: null,
    });

    expect(values.size).toBe(1);
    expect(typesSeen).toEqual([1]);
  });

  it("ignores share tokens whose market was not attested", async () => {
    const values = await resolveSiloShareValues(
      fakeChain({ shareSilo: other }),
      { chainId: 50, markets: [market], movements, blockNumber: 1n },
    );

    expect(values.size).toBe(0);
  });

  it("skips lookups when no market was attested", async () => {
    const values = await resolveSiloShareValues(fakeChain(), {
      chainId: 50,
      markets: [],
      movements,
      blockNumber: 1n,
    });

    expect(values.size).toBe(0);
  });

  it("returns no value when a lookup fails", async () => {
    const values = await resolveSiloShareValues(
      {
        call: async () => {
          throw new Error("rate limited");
        },
      },
      { chainId: 50, markets: [market], movements, blockNumber: 1n },
    );

    expect(values.size).toBe(0);
  });
});

describe("attestedSiloMarkets", () => {
  it("keeps only addresses labelled as Silo market vaults", () => {
    expect(
      attestedSiloMarkets([
        { address: market, label: "Silo market vault" },
        { address: asset, label: "Silo configured asset" },
      ]),
    ).toEqual([market]);
  });

  it("accepts a market that the attestation labelled as its collateral share token", () => {
    expect(
      attestedSiloMarkets([
        { address: market, label: "Silo collateral share token" },
        { address: protectedShare, label: "Silo protected share token" },
      ]),
    ).toEqual([market]);
  });
});
