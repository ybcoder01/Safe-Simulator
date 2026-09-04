import { describe, expect, it } from "vitest";

import {
  CANONICAL_PERMIT2_ADDRESS,
  extractApprovalRequests,
} from "../../../../../src/core/analysis/tokens/approval-intents";
import type {
  Address,
  DecodedCall,
  Hex,
  SafeTransaction,
} from "../../../../../src/core/domain";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const token = "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;
const owner = "0x4444444444444444444444444444444444444444" as Address;
const hash =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Hex;

function word(value: bigint | Address): string {
  const body =
    typeof value === "bigint"
      ? value.toString(16)
      : value.toLowerCase().slice(2);
  return body.padStart(64, "0");
}

function calldata(selector: string, ...values: (bigint | Address)[]): Hex {
  return (selector + values.map(word).join("")) as Hex;
}

function transaction(to: Address, data: Hex): SafeTransaction {
  return {
    safe: { chainId: 50, address: safe },
    safeTxHash: hash,
    nonce: 1n,
    to,
    value: 0n,
    data,
    operation: "call",
    status: "pending",
    confirmations: [],
    proposedAt: 1,
    executedAt: null,
    executedTxHash: null,
    blockNumber: null,
    blockHash: null,
  };
}

function decodedWithNested(call: DecodedCall): DecodedCall {
  return {
    method: "multiSend",
    parameters: [
      {
        name: "transactions",
        type: "bytes",
        value: "0x",
        nestedCalls: [call],
      },
    ],
    to: safe,
    value: "0",
    data: null,
    operation: "delegatecall",
  };
}

describe("extractApprovalRequests", () => {
  it("decodes a direct infinite ERC-20 approval", () => {
    const amount = (1n << 256n) - 1n;
    const result = extractApprovalRequests(
      transaction(token, calldata("0x095ea7b3", spender, amount)),
      null,
    );

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          standard: "erc20",
          source: "transaction-calldata",
          target: token,
          token,
          owner: safe,
          spender,
          amount,
          infinite: true,
          depth: 0,
        }),
      ],
      limited: false,
    });
  });

  it("flags direct full-collection operator access", () => {
    const result = extractApprovalRequests(
      transaction(token, calldata("0xa22cb465", spender, 1n)),
      null,
    );

    expect(result.items[0]).toMatchObject({
      standard: "operator-all",
      method: "setApprovalForAll",
      token,
      owner: safe,
      spender,
      infinite: true,
    });
    expect(result.items[0]?.warning).toContain("every compatible token");
  });

  it("recognizes operator-access revocation without flagging it as infinite", () => {
    const result = extractApprovalRequests(
      transaction(token, calldata("0xa22cb465", spender, 0n)),
      null,
    );

    expect(result.items[0]).toMatchObject({
      standard: "operator-all",
      method: "setApprovalForAll",
      amount: 0n,
      infinite: false,
    });
  });

  it("recursively finds an approval in decoded batch calldata", () => {
    const nested: DecodedCall = {
      method: "approve",
      parameters: [],
      to: token,
      value: "0",
      data: calldata("0x095ea7b3", spender, 1000n),
      operation: "call",
    };

    const result = extractApprovalRequests(
      transaction(safe, "0x12345678"),
      decodedWithNested(nested),
    );

    expect(result.items).toContainEqual(
      expect.objectContaining({
        standard: "erc20",
        source: "nested-calldata",
        token,
        owner: null,
        spender,
        amount: 1000n,
        depth: 1,
      }),
    );
  });

  it("decodes ERC-20 allowance increases as deltas", () => {
    const result = extractApprovalRequests(
      transaction(token, calldata("0x39509351", spender, 250n)),
      null,
    );

    expect(result.items[0]).toMatchObject({
      standard: "erc20",
      method: "increaseAllowance",
      amount: 250n,
      amountMode: "increase",
      infinite: null,
      owner: safe,
      spender,
    });
  });

  it("decodes nested ERC-20 allowance decreases as deltas", () => {
    const nested: DecodedCall = {
      method: "decreaseAllowance",
      parameters: [],
      to: token,
      value: "0",
      data: calldata("0xa457c2d7", spender, 75n),
      operation: "call",
    };

    const result = extractApprovalRequests(
      transaction(safe, "0x12345678"),
      decodedWithNested(nested),
    );

    expect(result.items[0]).toMatchObject({
      standard: "erc20",
      source: "nested-calldata",
      method: "decreaseAllowance",
      amount: 75n,
      amountMode: "decrease",
      infinite: null,
      depth: 1,
    });
  });

  it("decodes canonical Permit2 allowance approval", () => {
    const amount = (1n << 160n) - 1n;
    const result = extractApprovalRequests(
      transaction(
        CANONICAL_PERMIT2_ADDRESS,
        calldata("0x87517c45", token, spender, amount, 12345n),
      ),
      null,
    );

    expect(result.items[0]).toMatchObject({
      standard: "permit2-allowance",
      method: "approve",
      token,
      owner: safe,
      spender,
      amount,
      infinite: true,
      expiration: 12345n,
    });
  });

  it("decodes canonical Permit2 single permit fields", () => {
    const data = calldata(
      "0x2b67b570",
      owner,
      token,
      500n,
      1000n,
      7n,
      spender,
      2000n,
      256n,
    );
    const result = extractApprovalRequests(
      transaction(CANONICAL_PERMIT2_ADDRESS, data),
      null,
    );

    expect(result.items[0]).toMatchObject({
      standard: "permit2-allowance",
      method: "permit",
      token,
      owner,
      spender,
      amount: 500n,
      infinite: false,
      expiration: 1000n,
    });
  });

  it("keeps Permit2 signature transfer spender scope explicit", () => {
    const data = calldata(
      "0x30f28b7a",
      token,
      900n,
      1n,
      9999n,
      spender,
      400n,
      owner,
      256n,
    );
    const result = extractApprovalRequests(
      transaction(CANONICAL_PERMIT2_ADDRESS, data),
      null,
    );

    expect(result.items[0]).toMatchObject({
      standard: "permit2-signature-transfer",
      token,
      owner,
      spender: null,
      amount: 900n,
      infinite: false,
    });
    expect(result.items[0]?.warning).toContain("caller-dependent");
  });

  it("does not classify Permit2 selectors at another target", () => {
    const result = extractApprovalRequests(
      transaction(token, calldata("0x87517c45", token, spender, 1n, 2n)),
      null,
    );

    expect(result.items).toEqual([]);
  });
});
