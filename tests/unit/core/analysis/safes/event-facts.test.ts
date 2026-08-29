import { describe, expect, it } from "vitest";

import {
  extractSafeConfigurationChanges,
  SAFE_ADDED_OWNER_TOPIC,
  SAFE_CHANGED_GUARD_TOPIC,
  SAFE_CHANGED_THRESHOLD_TOPIC,
  SAFE_DISABLED_MODULE_TOPIC,
} from "../../../../../src/core/analysis/safes/event-facts";
import type {
  Address,
  Hex,
  LogEntry,
} from "../../../../../src/core/domain";

const safe = "0x1111111111111111111111111111111111111111" as Address;
const owner = "0x2222222222222222222222222222222222222222" as Address;
const moduleAddress =
  "0x3333333333333333333333333333333333333333" as Address;
const guard = "0x4444444444444444444444444444444444444444" as Address;
const unrelated =
  "0x5555555555555555555555555555555555555555" as Address;

function addressWord(address: Address): Hex {
  return ("0x" + "0".repeat(24) + address.slice(2)) as Hex;
}

function numberWord(value: bigint): Hex {
  return ("0x" + value.toString(16).padStart(64, "0")) as Hex;
}

function log(
  address: Address,
  topic: Hex,
  data: Hex,
  logIndex: number,
): LogEntry {
  return { address, topics: [topic], data, logIndex };
}

describe("extractSafeConfigurationChanges", () => {
  it("extracts transaction-specific owner, threshold, module, and guard events", () => {
    const changes = extractSafeConfigurationChanges(
      [
        log(safe, SAFE_ADDED_OWNER_TOPIC, addressWord(owner), 1),
        log(safe, SAFE_CHANGED_THRESHOLD_TOPIC, numberWord(2n), 2),
        log(safe, SAFE_DISABLED_MODULE_TOPIC, addressWord(moduleAddress), 3),
        log(safe, SAFE_CHANGED_GUARD_TOPIC, addressWord(guard), 4),
      ],
      safe,
    );

    expect(changes).toEqual([
      {
        field: "owner",
        action: "added",
        before: null,
        after: owner,
        logIndex: 1,
        provenance: "safe-event",
      },
      {
        field: "threshold",
        action: "changed",
        before: null,
        after: "2",
        logIndex: 2,
        provenance: "safe-event",
      },
      {
        field: "module",
        action: "removed",
        before: moduleAddress,
        after: null,
        logIndex: 3,
        provenance: "safe-event",
      },
      {
        field: "guard",
        action: "changed",
        before: null,
        after: guard,
        logIndex: 4,
        provenance: "safe-event",
      },
    ]);
  });

  it("ignores lookalike events emitted by another contract", () => {
    expect(
      extractSafeConfigurationChanges(
        [log(unrelated, SAFE_ADDED_OWNER_TOPIC, addressWord(owner), 1)],
        safe,
      ),
    ).toEqual([]);
  });

  it("accepts a strictly indexed single-word event shape", () => {
    const indexed: LogEntry = {
      address: safe,
      topics: [SAFE_ADDED_OWNER_TOPIC, addressWord(owner)],
      data: "0x",
      logIndex: 7,
    };

    expect(extractSafeConfigurationChanges([indexed], safe)[0]).toMatchObject({
      field: "owner",
      action: "added",
      after: owner,
    });
  });

  it("rejects malformed and multi-word payloads", () => {
    const malformed: LogEntry[] = [
      log(safe, SAFE_ADDED_OWNER_TOPIC, "0x1234", 1),
      {
        address: safe,
        topics: [SAFE_CHANGED_THRESHOLD_TOPIC],
        data: ("0x" + "0".repeat(128)) as Hex,
        logIndex: 2,
      },
    ];

    expect(extractSafeConfigurationChanges(malformed, safe)).toEqual([]);
  });
});
