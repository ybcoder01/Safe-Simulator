import { encodeFunctionData, maxUint256 } from "viem";
import { describe, expect, it } from "vitest";

import {
  classifyApothemCall,
  unwrapSafeExecution,
} from "../../../../src/lib/testnet/apothem";

const target = "0x0000000000000000000000000000000000005101";
const spender = "0x0000000000000000000000000000000000005102";
const recipient = "0x0000000000000000000000000000000000005103";

describe("XDC Apothem attack classification", () => {
  it("flags unlimited token approvals", () => {
    const data = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "ok", type: "bool" }],
        },
      ] as const,
      functionName: "approve",
      args: [spender, maxUint256],
    });

    const findings = classifyApothemCall({
      target,
      value: 0n,
      data,
      operation: "call",
      wrappedBySafe: false,
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unlimited-token-approval",
          severity: "critical",
        }),
      ]),
    );
  });

  it("flags recipient injection in router calldata", () => {
    const data = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "route",
          stateMutability: "nonpayable",
          inputs: [
            { name: "token", type: "address" },
            { name: "recipient", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [],
        },
      ] as const,
      functionName: "route",
      args: [target, recipient, 1n],
    });

    const findings = classifyApothemCall({
      target,
      value: 0n,
      data,
      operation: "call",
      wrappedBySafe: false,
    });

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "recipient-in-calldata",
          severity: "critical",
        }),
      ]),
    );
  });

  it("unwraps Safe execTransaction and preserves delegatecall", () => {
    const data = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "execTransaction",
          stateMutability: "payable",
          inputs: [
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
            { name: "operation", type: "uint8" },
            { name: "safeTxGas", type: "uint256" },
            { name: "baseGas", type: "uint256" },
            { name: "gasPrice", type: "uint256" },
            { name: "gasToken", type: "address" },
            { name: "refundReceiver", type: "address" },
            { name: "signatures", type: "bytes" },
          ],
          outputs: [{ name: "success", type: "bool" }],
        },
      ] as const,
      functionName: "execTransaction",
      args: [
        target,
        0n,
        "0x12345678",
        1,
        0n,
        0n,
        0n,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        "0x",
      ],
    });

    const unwrapped = unwrapSafeExecution(target, 0n, data);

    expect(unwrapped.wrappedBySafe).toBe(true);
    expect(unwrapped.operation).toBe("delegatecall");
    expect(classifyApothemCall(unwrapped)[0]?.code).toBe(
      "delegatecall-operation",
    );
  });

  it("flags nested multicalls", () => {
    const data = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "multicall",
          stateMutability: "payable",
          inputs: [{ name: "calls", type: "bytes[]" }],
          outputs: [{ name: "results", type: "bytes[]" }],
        },
      ] as const,
      functionName: "multicall",
      args: [["0x12345678"]],
    });

    expect(
      classifyApothemCall({
        target,
        value: 0n,
        data,
        operation: "call",
        wrappedBySafe: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "nested-multicall",
          severity: "warning",
        }),
      ]),
    );
  });

  it("flags proxy implementation replacement", () => {
    const data = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "upgradeToAndCall",
          stateMutability: "payable",
          inputs: [
            { name: "implementation", type: "address" },
            { name: "data", type: "bytes" },
          ],
          outputs: [],
        },
      ] as const,
      functionName: "upgradeToAndCall",
      args: [spender, "0x12345678"],
    });

    expect(
      classifyApothemCall({
        target,
        value: 0n,
        data,
        operation: "call",
        wrappedBySafe: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "proxy-implementation-change",
          severity: "critical",
        }),
      ]),
    );
  });

  it("flags Safe security-control changes", () => {
    const data = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "enableModule",
          stateMutability: "nonpayable",
          inputs: [{ name: "module", type: "address" }],
          outputs: [],
        },
      ] as const,
      functionName: "enableModule",
      args: [spender],
    });

    expect(
      classifyApothemCall({
        target,
        value: 0n,
        data,
        operation: "call",
        wrappedBySafe: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "safe-control-change",
          severity: "critical",
        }),
      ]),
    );
  });
});
