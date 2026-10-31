import { describe, expect, it } from "vitest";

import { detectHighRiskCallIntents } from "../../../../../src/core/analysis/security/high-risk-intents";
import type {
  Address,
  DecodedCall,
  Hex,
} from "../../../../../src/core/domain";

const target = "0x1111111111111111111111111111111111111111" as Address;
const module = "0x2222222222222222222222222222222222222222" as Address;

function encoded(selector: string): Hex {
  return (selector + "0".repeat(64)) as Hex;
}

function call(
  to: Address,
  data: Hex,
  children: readonly DecodedCall[] = [],
): DecodedCall {
  return {
    method: "multicall",
    parameters: [
      {
        name: "calls",
        type: "bytes[]",
        value: "[]",
        nestedCalls: [...children],
      },
    ],
    to,
    value: "0",
    data,
    operation: "call",
  };
}

describe("detectHighRiskCallIntents", () => {
  it("flags a direct proxy implementation replacement", () => {
    const findings = detectHighRiskCallIntents(
      { to: target, data: encoded("0x4f1ef286") },
      null,
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "proxy-implementation-change",
        severity: "critical",
        addresses: [target],
      }),
    );
  });

  it("finds a Safe module change hidden in nested calldata", () => {
    const nested = call(module, encoded("0x610b5925"));
    const decoded = call(target, encoded("0xac9650d8"), [nested]);

    const findings = detectHighRiskCallIntents(
      { to: target, data: decoded.data },
      decoded,
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        code: "safe-module-change",
        severity: "critical",
        addresses: [module],
      }),
    );
  });

  it("does not flag an unrelated contract call", () => {
    expect(
      detectHighRiskCallIntents(
        { to: target, data: encoded("0xa9059cbb") },
        null,
      ),
    ).toEqual([]);
  });
});
