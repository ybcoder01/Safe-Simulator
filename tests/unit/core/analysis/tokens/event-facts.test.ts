import { describe, expect, it } from "vitest";

import {
  ERC20_APPROVAL_TOPIC,
  ERC20_TRANSFER_TOPIC,
  extractTokenEventFacts,
} from "../../../../../src/core/analysis/tokens/event-facts";
import type {
  Address,
  Hex,
  LogEntry,
} from "../../../../../src/core/domain";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const counterparty =
  "0x2222222222222222222222222222222222222222" as Address;
const spender = "0x3333333333333333333333333333333333333333" as Address;
const token = "0x4444444444444444444444444444444444444444" as Address;
const maxUint256 = (1n << 256n) - 1n;

function addressTopic(address: Address): Hex {
  return `0x${"0".repeat(24)}${address.slice(2)}` as Hex;
}

function word(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

function log(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    address: token,
    topics: [
      ERC20_TRANSFER_TOPIC,
      addressTopic(safe),
      addressTopic(counterparty),
    ],
    data: word(25n),
    logIndex: 4,
    ...overrides,
  };
}

describe("extractTokenEventFacts", () => {
  it("extracts outbound and inbound ERC-20-shaped transfers", () => {
    const result = extractTokenEventFacts(
      [
        log(),
        log({
          topics: [
            ERC20_TRANSFER_TOPIC,
            addressTopic(counterparty),
            addressTopic(safe),
          ],
          data: word(10n),
          logIndex: 5,
        }),
      ],
      safe,
    );

    expect(result.movements).toEqual([
      {
        token,
        from: safe,
        to: counterparty,
        amount: 25n,
        direction: "outbound",
        logIndex: 4,
      },
      {
        token,
        from: counterparty,
        to: safe,
        amount: 10n,
        direction: "inbound",
        logIndex: 5,
      },
    ]);
  });

  it("classifies maximum allowance without rounding", () => {
    const result = extractTokenEventFacts(
      [
        log({
          topics: [
            ERC20_APPROVAL_TOPIC,
            addressTopic(safe),
            addressTopic(spender),
          ],
          data: word(maxUint256),
        }),
      ],
      safe,
    );

    expect(result.allowances).toEqual([
      {
        token,
        owner: safe,
        spender,
        amount: maxUint256,
        infinite: true,
        logIndex: 4,
      },
    ]);
  });

  it("keeps transfers unrelated to the Safe as external evidence", () => {
    const result = extractTokenEventFacts(
      [
        log({
          topics: [
            ERC20_TRANSFER_TOPIC,
            addressTopic(counterparty),
            addressTopic(spender),
          ],
        }),
      ],
      safe,
    );

    expect(result.movements[0]?.direction).toBe("external");
  });

  it("ignores malformed and four-topic NFT-shaped events", () => {
    const result = extractTokenEventFacts(
      [
        log({ data: "0x01" }),
        log({
          topics: [
            ERC20_TRANSFER_TOPIC,
            addressTopic(safe),
            addressTopic(counterparty),
            word(1n),
          ],
          data: "0x",
        }),
      ],
      safe,
    );

    expect(result).toEqual({ movements: [], allowances: [] });
  });
});
