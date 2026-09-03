import { describe, expect, it } from "vitest";

import { classifyTransactionActivity } from "../../../../../src/core/analysis/decoding/activity";
import type {
  Address,
  Hex,
  SafeTransaction,
} from "../../../../../src/core/domain";

const safe = {
  chainId: 50,
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173" as Address,
};

function transaction(
  data: Hex,
  options: Partial<Pick<SafeTransaction, "to" | "operation" | "value">> = {},
) {
  return {
    safe,
    to:
      options.to ??
      ("0x2222222222222222222222222222222222222222" as Address),
    data,
    operation: options.operation ?? "call",
    value: options.value ?? 0n,
  };
}

describe("transaction activity classification", () => {
  it("labels exact selectors before considering the target role", () => {
    const morpho =
      "0xEa49B0fE898aF913A3826F9f462eE2cDcb854fD9" as Address;

    expect(
      classifyTransactionActivity(
        transaction("0x095ea7b3" as Hex, { to: morpho }),
      ),
    ).toEqual({
      type: "approval",
      label: "Token approval",
      basis: "selector",
    });
  });

  it("labels common swap, lending, Safe configuration, and batch selectors", () => {
    expect(
      classifyTransactionActivity(transaction("0x38ed1739" as Hex)),
    ).toMatchObject({ type: "swap", basis: "selector" });
    expect(
      classifyTransactionActivity(transaction("0x617ba037" as Hex)),
    ).toMatchObject({ type: "lending", basis: "selector" });
    expect(
      classifyTransactionActivity(transaction("0xe19a9dd9" as Hex)),
    ).toMatchObject({ type: "safe-configuration", basis: "selector" });
    expect(
      classifyTransactionActivity(transaction("0x8d80ff0a" as Hex)),
    ).toMatchObject({ type: "batch", basis: "selector" });
  });

  it("uses conservative protocol interaction labels for reviewed targets", () => {
    const morpho =
      "0xEa49B0fE898aF913A3826F9f462eE2cDcb854fD9" as Address;

    expect(
      classifyTransactionActivity(
        transaction("0x12345678" as Hex, { to: morpho }),
      ),
    ).toEqual({
      type: "lending",
      label: "Lending protocol interaction",
      basis: "reviewed-target",
    });
  });

  it("distinguishes native transfers, delegate calls, and unknown calls", () => {
    expect(
      classifyTransactionActivity(transaction("0x" as Hex, { value: 5n })),
    ).toEqual({
      type: "transfer",
      label: "Native asset transfer",
      basis: "native-value",
    });
    expect(
      classifyTransactionActivity(
        transaction("0x12345678" as Hex, { operation: "delegatecall" }),
      ),
    ).toEqual({
      type: "delegatecall",
      label: "Delegate call",
      basis: "operation",
    });
    expect(
      classifyTransactionActivity(transaction("0x12345678" as Hex)),
    ).toEqual({
      type: "contract-call",
      label: "Contract call",
      basis: "fallback",
    });
  });
});
