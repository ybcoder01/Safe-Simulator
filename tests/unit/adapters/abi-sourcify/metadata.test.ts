import { describe, expect, it, vi } from "vitest";

import { PublicAbiAdapter } from "../../../../src/adapters/abi-sourcify/metadata";
import type { Address, Hex } from "../../../../src/core/domain";
import type { ChainPort } from "../../../../src/core/ports";

const target = "0x1111111111111111111111111111111111111111" as Address;
const registeredSafe = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" as Address;
const implementation = "0x2222222222222222222222222222222222222222" as Address;
const beacon = "0x3333333333333333333333333333333333333333" as Address;
const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const beaconSlot =
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

function word(address: Address): Hex {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function makeChain(overrides: Partial<ChainPort> = {}): ChainPort {
  return {
    getCode: vi.fn().mockResolvedValue("0x6000"),
    getStorageAt: vi.fn().mockResolvedValue("0x"),
    getSafeSnapshot: vi.fn(),
    call: vi.fn().mockResolvedValue("0x"),
    getBlockHash: vi.fn(),
    getTransactionBlock: vi.fn(),
    ...overrides,
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PublicAbiAdapter", () => {
  it("loads a verified function ABI and contract label from Sourcify", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        abi: [
          {
            type: "function",
            name: "approve",
            stateMutability: "nonpayable",
            inputs: [
              { name: "spender", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [{ name: "", type: "bool" }],
          },
          { type: "event", name: "Approval", inputs: [] },
        ],
        compilation: { name: "TestToken" },
        storageLayout: {
          storage: [
            {
              astId: 1,
              contract: "contracts/TestToken.sol:TestToken",
              label: "totalSupply",
              offset: 0,
              slot: "2",
              type: "t_uint256",
            },
          ],
          types: {
            t_uint256: {
              encoding: "inplace",
              label: "uint256",
              numberOfBytes: "32",
            },
          },
        },
      }),
    );
    const adapter = new PublicAbiAdapter(
      makeChain(),
      fetcher as unknown as typeof fetch,
    );

    await expect(
      adapter.getContractMetadata(50, target),
    ).resolves.toMatchObject({
      address: target,
      label: "TestToken",
      verified: true,
      source: "sourcify",
      implementation: null,
      abi: [{ type: "function", name: "approve" }],
      storageLayout: {
        slots: [
          {
            slot: "0x0000000000000000000000000000000000000000000000000000000000000002",
            label: "totalSupply",
            type: "uint256",
            offset: 0,
            numberOfBytes: 32,
            encoding: "inplace",
          },
        ],
      },
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(
        `/v2/contract/50/${target}?fields=abi,compilation,storageLayout`,
      ),
      { cache: "force-cache" },
    );
  });

  it("follows ERC-1967 implementation slots and stops on a cycle", async () => {
    const storage = vi.fn(
      async (_chainId: number, address: Address, slot: Hex) => {
        if (address === target && slot === implementationSlot) {
          return word(implementation);
        }
        if (address === implementation && slot === implementationSlot) {
          return word(target);
        }
        return "0x" as Hex;
      },
    );
    const adapter = new PublicAbiAdapter(makeChain({ getStorageAt: storage }));

    await expect(
      adapter.resolveImplementationChain(50, target),
    ).resolves.toEqual([implementation]);
  });

  it("resolves an ERC-1967 beacon implementation with a read-only call", async () => {
    const call = vi.fn().mockResolvedValue(word(implementation));
    const storage = vi.fn(
      async (_chainId: number, address: Address, slot: Hex) => {
        if (address === target && slot === beaconSlot) return word(beacon);
        return "0x" as Hex;
      },
    );
    const adapter = new PublicAbiAdapter(
      makeChain({ getStorageAt: storage, call }),
    );

    await expect(
      adapter.resolveImplementationChain(50, target),
    ).resolves.toEqual([implementation]);
    expect(call).toHaveBeenCalledWith(50, {
      to: beacon,
      data: "0x5c60da1b",
    });
  });

  it("returns unknown metadata when no verified contract is available", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({}, 404));
    const adapter = new PublicAbiAdapter(
      makeChain(),
      fetcher as unknown as typeof fetch,
    );

    await expect(
      adapter.getContractMetadata(50, target),
    ).resolves.toMatchObject({
      address: target,
      verified: false,
      abi: null,
      source: "unknown",
    });
  });

  it("uses an authoritative registry label when verified metadata is unavailable", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({}, 404));
    const adapter = new PublicAbiAdapter(
      makeChain(),
      fetcher as unknown as typeof fetch,
    );

    await expect(
      adapter.getContractMetadata(50, registeredSafe),
    ).resolves.toMatchObject({
      address: registeredSafe,
      label: "Safe v1.4.1 L2 Singleton",
      verified: false,
      abi: null,
      source: "registry",
    });
  });

  it("uses only one verified signature and rejects ambiguous matches", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          result: {
            function: {
              "0x095ea7b3": [
                {
                  name: "approve(address,uint256)",
                  hasVerifiedContract: true,
                },
                { name: "collision(bytes32)", hasVerifiedContract: false },
              ],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          result: {
            function: {
              "0x095ea7b3": [
                {
                  name: "approve(address,uint256)",
                  hasVerifiedContract: true,
                },
                {
                  name: "other(address,uint256)",
                  hasVerifiedContract: true,
                },
              ],
            },
          },
        }),
      );
    const adapter = new PublicAbiAdapter(
      makeChain(),
      fetcher as unknown as typeof fetch,
    );

    await expect(adapter.lookupFunctionSignature("0x095ea7b3")).resolves.toBe(
      "approve(address,uint256)",
    );
    await expect(
      adapter.lookupFunctionSignature("0x095ea7b3"),
    ).resolves.toBeNull();
  });
});
