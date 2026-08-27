import { describe, expect, it } from "vitest";

import type { DecodedCall, Hex } from "../../../../../src/core/domain";
import {
  decodedCallSummary,
  knownCallSummary,
} from "../../../../../src/core/analysis/decoding/calldata";

describe("calldata summaries", () => {
  it("summarizes the imported Safe's USDC approval fixture", () => {
    const data =
      "0x095ea7b3000000000000000000000000941acf4e2df51bf43c3c4167631dbefa268bc9d700000000000000000000000000000000000000000000000000000000000f4240" as Hex;

    expect(knownCallSummary(data, "call")).toBe(
      "Approve 0x941acf…68bc9d7 for 1000000 base units",
    );
  });

  it("identifies routed command execution without guessing parameters", () => {
    expect(
      knownCallSummary(
        "0x3593564c00000000000000000000000000000000" as Hex,
        "call",
      ),
    ).toBe("Execute routed commands");
  });

  it("keeps unknown selectors explicit", () => {
    expect(knownCallSummary("0x1234567800000000" as Hex, "call")).toBeNull();
  });

  it("summarizes normalized approval and batch decodes", () => {
    const approval: DecodedCall = {
      method: "approve",
      parameters: [
        {
          name: "spender",
          type: "address",
          value: "0x941acf4e2df51bf43c3c4167631dbefa268bc9d7",
          nestedCalls: [],
        },
        {
          name: "amount",
          type: "uint256",
          value: "1000000",
          nestedCalls: [],
        },
      ],
      to: null,
      value: null,
      data: null,
      operation: null,
    };
    const batch: DecodedCall = {
      ...approval,
      method: "multiSend",
      parameters: [
        {
          name: "transactions",
          type: "bytes",
          value: "0x",
          nestedCalls: [approval, approval],
        },
      ],
    };

    expect(decodedCallSummary(approval)).toBe(
      "Approve 0x941acf…68bc9d7 for 1000000 base units",
    );
    expect(decodedCallSummary(batch)).toBe("Batch of 2 decoded calls");
  });
});
