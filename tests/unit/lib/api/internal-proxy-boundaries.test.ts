import { describe, expect, it, vi } from "vitest";

import type { Address } from "../../../../src/core/domain";
import type { AbiPort } from "../../../../src/core/ports";
import type { ExecutionInsight } from "../../../../src/lib/api/execution-insight";
import { resolveInternalProxyBoundaries } from "../../../../src/lib/api/internal-proxy-boundaries";

const proxy = "0x1111111111111111111111111111111111111111" as Address;
const implementation = "0x2222222222222222222222222222222222222222" as Address;
const other = "0x3333333333333333333333333333333333333333" as Address;

function call(
  from: Address,
  to: Address,
): ExecutionInsight["internalCalls"][number] {
  return {
    depth: 2,
    from,
    to,
    input: "0x",
    value: "0",
    operation: "delegatecall",
    reverted: false,
    error: null,
  };
}

describe("resolveInternalProxyBoundaries", () => {
  it("returns a traced direct boundary anchored to the supplied block", async () => {
    const resolveImplementationChain = vi
      .fn()
      .mockResolvedValue([implementation]);
    const abi = { resolveImplementationChain } as unknown as AbiPort;

    await expect(
      resolveInternalProxyBoundaries(
        abi,
        50,
        [call(proxy, implementation)],
        [],
        12n,
      ),
    ).resolves.toEqual([{ proxy, implementation }]);
    expect(resolveImplementationChain).toHaveBeenCalledWith(50, proxy, 12n);
  });

  it("fails closed when the resolved implementation is not the traced target", async () => {
    const abi = {
      resolveImplementationChain: vi.fn().mockResolvedValue([other]),
    } as unknown as AbiPort;

    await expect(
      resolveInternalProxyBoundaries(
        abi,
        50,
        [call(proxy, implementation)],
        [],
      ),
    ).resolves.toEqual([]);
  });

  it("fails closed when proxy resolution is unavailable", async () => {
    const abi = {
      resolveImplementationChain: vi
        .fn()
        .mockRejectedValue(new Error("RPC unavailable")),
    } as unknown as AbiPort;

    await expect(
      resolveInternalProxyBoundaries(
        abi,
        50,
        [call(proxy, implementation)],
        [],
      ),
    ).resolves.toEqual([]);
  });

  it("deduplicates callers and caps external lookups", async () => {
    const sources = Array.from(
      { length: 10 },
      (_, index) =>
        `0x${(index + 10).toString(16).padStart(40, "0")}` as Address,
    );
    const resolveImplementationChain = vi
      .fn()
      .mockResolvedValue([implementation]);
    const abi = { resolveImplementationChain } as unknown as AbiPort;
    const calls = [
      ...sources.map((source) => call(source, implementation)),
      call(sources[0] as Address, implementation),
    ];

    await resolveInternalProxyBoundaries(abi, 50, calls, []);

    expect(resolveImplementationChain).toHaveBeenCalledTimes(8);
  });
});
