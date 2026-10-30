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
  it.each([
    {
      name: "nested multicall",
      signature: {
        type: "function",
        name: "multicall",
        stateMutability: "payable",
        inputs: [{ name: "calls", type: "bytes[]" }],
        outputs: [{ name: "results", type: "bytes[]" }],
      } as const,
      args: [["0x12345678"]] as const,
      code: "nested-multicall",
      severity: "warning",
    },
    {
      name: "proxy implementation replacement",
      signature: {
        type: "function",
        name: "upgradeToAndCall",
        stateMutability: "payable",
        inputs: [
          { name: "implementation", type: "address" },
          { name: "data", type: "bytes" },
        ],
        outputs: [],
      } as const,
      args: [spender, "0x12345678"] as const,
      code: "proxy-implementation-change",
      severity: "critical",
    },
    {
      name: "Safe module enablement",
      signature: {
        type: "function",
        name: "enableModule",
        stateMutability: "nonpayable",
        inputs: [{ name: "module", type: "address" }],
        outputs: [],
      } as const,
      args: [spender] as const,
      code: "safe-control-change",
      severity: "critical",
    },
  ])("flags $name", ({ signature, args, code, severity }) => {
    const data = encodeFunctionData({
      abi: [signature],
      functionName: signature.name,
      args,
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
          code,
          severity,
        }),
      ]),
    );
  });

});
