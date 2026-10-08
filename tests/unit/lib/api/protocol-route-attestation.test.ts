import { decodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import { describe, expect, it, vi } from "vitest";

import type {
  Address,
  Hex,
  SafeTransaction,
} from "../../../../src/core/domain";
import type { ChainPort } from "../../../../src/core/ports";
import type { ExecutionInsight } from "../../../../src/lib/api/execution-insight";
import { resolveProtocolRouteAttestation } from "../../../../src/lib/api/protocol-route-attestation";

const router = "0x4fFf70C17fb974121a1Ad64C97b04a2e38DbfE7C" as Address;
const factory = "0xf81d90DF1B63d48536E78564d24d5DD8F2BE58aD" as Address;
const implementation = "0xA8C5eb9ae9c7a8fab4116d1e9c1FCfc8A478b390" as Address;
const safe = "0x1111111111111111111111111111111111111111" as Address;
const market0 = "0x2222222222222222222222222222222222222222" as Address;
const market1 = "0x3333333333333333333333333333333333333333" as Address;
const config = "0x4444444444444444444444444444444444444444" as Address;
const asset0 = "0x5555555555555555555555555555555555555555" as Address;
const asset1 = "0x6666666666666666666666666666666666666666" as Address;
const share0 = "0x7777777777777777777777777777777777777777" as Address;
const share1 = "0x8888888888888888888888888888888888888888" as Address;
const unknown = "0x9999999999999999999999999999999999999999" as Address;
const zero = "0x0000000000000000000000000000000000000000" as Address;

const factoryAbi = parseAbi([
  "function isSilo(address silo) view returns (bool)",
]);
const siloAbi = parseAbi([
  "function config() view returns (address siloConfig)",
]);
const configAbi = parseAbi([
  "function getSilos() view returns (address silo0, address silo1)",
  "function getConfig(address silo) view returns ((uint256 daoFee,uint256 deployerFee,address silo,address token,address protectedShareToken,address collateralShareToken,address debtShareToken,address solvencyOracle,address maxLtvOracle,address interestRateModel,uint256 maxLtv,uint256 lt,uint256 liquidationTargetLtv,uint256 liquidationFee,uint256 flashloanFee,address hookReceiver,bool callBeforeQuote) config)",
]);

function transaction(to: Address = router): SafeTransaction {
  return {
    safe: { chainId: 50, address: safe },
    safeTxHash:
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex,
    nonce: 1n,
    to,
    value: 0n,
    data: "0x12345678" as Hex,
    operation: "call",
    status: "pending",
    confirmations: [],
    proposedAt: 1_780_000_000,
    executedAt: null,
    executedTxHash: null,
    blockNumber: 123n,
    blockHash:
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Hex,
  };
}

function calls(includeUnknown = false): ExecutionInsight["internalCalls"] {
  return [
    {
      depth: 1,
      from: router,
      to: market0,
      input: "0x" as Hex,
      value: "0",
      operation: "call",
      reverted: false,
      error: null,
    },
    {
      depth: 2,
      from: market0,
      to: implementation,
      input: "0x" as Hex,
      value: "0",
      operation: "delegatecall",
      reverted: false,
      error: null,
    },
    ...(includeUnknown
      ? [
          {
            depth: 2,
            from: market0,
            to: unknown,
            input: "0x" as Hex,
            value: "0",
            operation: "call" as const,
            reverted: false,
            error: null,
          },
        ]
      : []),
  ];
}

function marketConfig(silo: Address, token: Address, share: Address) {
  return {
    daoFee: 0n,
    deployerFee: 0n,
    silo,
    token,
    protectedShareToken: share,
    collateralShareToken: zero,
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
  };
}

function chainPort() {
  const call = vi.fn<ChainPort["call"]>(async (_chainId, request) => {
    if (request.to.toLowerCase() === factory.toLowerCase()) {
      const decoded = decodeFunctionData({
        abi: factoryAbi,
        data: request.data,
      });
      const address = decoded.args[0];
      return encodeFunctionResult({
        abi: factoryAbi,
        functionName: "isSilo",
        result:
          address.toLowerCase() === market0.toLowerCase() ||
          address.toLowerCase() === market1.toLowerCase(),
      });
    }
    if (
      request.to.toLowerCase() === market0.toLowerCase() ||
      request.to.toLowerCase() === market1.toLowerCase()
    ) {
      return encodeFunctionResult({
        abi: siloAbi,
        functionName: "config",
        result: config,
      });
    }
    if (request.to.toLowerCase() === config.toLowerCase()) {
      const decoded = decodeFunctionData({
        abi: configAbi,
        data: request.data,
      });
      if (decoded.functionName === "getSilos") {
        return encodeFunctionResult({
          abi: configAbi,
          functionName: "getSilos",
          result: [market0, market1],
        });
      }
      const silo = decoded.args[0];
      return encodeFunctionResult({
        abi: configAbi,
        functionName: "getConfig",
        result: marketConfig(
          silo,
          silo.toLowerCase() === market0.toLowerCase() ? asset0 : asset1,
          silo.toLowerCase() === market0.toLowerCase() ? share0 : share1,
        ),
      });
    }
    throw new Error(`Unexpected call to ${request.to}`);
  });
  return { call } as unknown as ChainPort;
}

describe("resolveProtocolRouteAttestation", () => {
  it("does not perform lookups for unsupported destinations", async () => {
    const chain = chainPort();
    const result = await resolveProtocolRouteAttestation(
      chain,
      transaction(unknown),
      { internalCalls: [] },
    );

    expect(result.status).toBe("not-applicable");
    expect(chain.call).not.toHaveBeenCalled();
  });

  it("proves factory lineage and the complete live market graph", async () => {
    const result = await resolveProtocolRouteAttestation(
      chainPort(),
      transaction(),
      { internalCalls: calls() },
    );

    expect(result.status).toBe("review");
    expect(result.findings).toContainEqual(
      expect.objectContaining({ code: "silo-permissionless-market" }),
    );
    expect(result.addresses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ address: market0 }),
        expect.objectContaining({ address: market1 }),
        expect.objectContaining({ address: config }),
        expect.objectContaining({ address: asset0 }),
        expect.objectContaining({ address: share1 }),
      ]),
    );
    expect(result.proxyBoundaries).toContainEqual({
      proxy: market0,
      implementation,
    });
  });

  it("keeps an injected internal target outside the attested graph visible", async () => {
    const result = await resolveProtocolRouteAttestation(
      chainPort(),
      transaction(),
      { internalCalls: calls(true) },
    );

    expect(result.status).toBe("review");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "protocol-route-attestation-incomplete",
        addresses: [unknown],
      }),
    );
  });

  it("fails closed when no traced market is recognized by the factory", async () => {
    const chain = chainPort();
    const result = await resolveProtocolRouteAttestation(chain, transaction(), {
      internalCalls: [
        {
          ...calls()[0]!,
          to: unknown,
        },
      ],
    });

    expect(result.status).toBe("unavailable");
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        code: "protocol-route-attestation-incomplete",
        addresses: [unknown],
      }),
    );
  });
});
