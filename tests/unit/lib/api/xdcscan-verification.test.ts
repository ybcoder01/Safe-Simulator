import { describe, expect, it, vi } from "vitest";

import type { Address } from "../../../../src/core/domain";
import {
  collectXdcContractReferences,
  resolveXdcContractVerification,
} from "../../../../src/lib/api/xdcscan-verification";

const contract = "0x1111111111111111111111111111111111111111" as Address;
const implementation = "0x2222222222222222222222222222222222222222" as Address;

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function cache() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

describe("XDCScan source verification", () => {
  it("deduplicates valid contract references", () => {
    expect(
      collectXdcContractReferences({
        transactionTarget: contract,
        decodedAddresses: [contract.toUpperCase().replace("0X", "0x")],
        nestedTargets: [null],
        traceTargets: [implementation],
        logEmitters: ["invalid"],
        storageContracts: [],
        tokenContracts: [],
        approvalContracts: [],
      }),
    ).toEqual([contract, implementation]);
  });

  it("reports verified source details and checks proxy implementations", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const address = new URL(String(input)).searchParams.get("address");
      return response({
        status: "1",
        message: "OK",
        result: [
          address === contract
            ? {
                SourceCode: "contract Proxy {}",
                ContractName: "Proxy",
                CompilerVersion: "v0.8.28",
                IsProxy: "true",
                ImplementationAddress: implementation,
              }
            : {
                SourceCode: "contract Implementation {}",
                ContractName: "Implementation",
                CompilerVersion: "v0.8.28",
                IsProxy: "false",
              },
        ],
      });
    });
    const cachePort = cache();

    const result = await resolveXdcContractVerification(
      cachePort,
      50,
      [contract],
      fetcher,
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        address: contract,
        status: "verified",
        contractName: "Proxy",
        isProxy: true,
        implementation,
      }),
      expect.objectContaining({
        address: implementation,
        status: "verified",
        contractName: "Implementation",
        isProxy: false,
      }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cachePort.set).toHaveBeenCalledTimes(2);
  });

  it("keeps a confirmed absence of source distinct from outages", async () => {
    const cachePort = cache();
    const unverified = await resolveXdcContractVerification(
      cachePort,
      50,
      [contract],
      vi.fn().mockResolvedValue(
        response({
          status: "1",
          message: "OK",
          result: [{ SourceCode: "", ContractName: "" }],
        }),
      ),
    );
    const unavailable = await resolveXdcContractVerification(
      cachePort,
      50,
      [contract],
      vi.fn().mockResolvedValue(response({}, 503)),
    );

    expect(unverified.items[0]).toMatchObject({
      status: "unverified",
      warning: expect.stringContaining("No verified source"),
    });
    expect(unavailable.items[0]).toMatchObject({
      status: "unavailable",
      warning: expect.stringContaining("HTTP 503"),
    });
  });

  it("does not call XDCScan for another network", async () => {
    const fetcher = vi.fn();

    const result = await resolveXdcContractVerification(
      cache(),
      1,
      [contract],
      fetcher,
    );

    expect(result.items).toEqual([]);
    expect(result.requestedCount).toBe(1);
    expect(result.warnings[0]).toContain("only");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reuses cached verified evidence", async () => {
    const cached = {
      address: contract,
      status: "verified" as const,
      contractName: "CachedContract",
      compilerVersion: "v0.8.28",
      isProxy: false,
      implementation: null,
      warning: null,
    };
    const cachePort = {
      get: vi.fn().mockResolvedValue(cached),
      set: vi.fn(),
    };
    const fetcher = vi.fn();

    const result = await resolveXdcContractVerification(
      cachePort,
      50,
      [contract],
      fetcher,
    );

    expect(result.items).toEqual([cached]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(cachePort.set).not.toHaveBeenCalled();
  });
});
