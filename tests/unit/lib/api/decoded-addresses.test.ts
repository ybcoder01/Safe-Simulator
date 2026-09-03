import { describe, expect, it } from "vitest";

import type { DecodedParameter } from "../../../../src/core/domain";
import { decodedAddressFields } from "../../../../src/lib/api/decoded-addresses";

function parameter(
  type: string,
  value: string,
  name = "recipient",
): Pick<DecodedParameter, "name" | "type" | "value"> {
  return { name, type, value };
}

describe("decoded address fields", () => {
  it("extracts and deduplicates typed address values", () => {
    const first = "0x1111111111111111111111111111111111111111";
    const second = "0x2222222222222222222222222222222222222222";

    expect(
      decodedAddressFields(
        50,
        parameter("address[]", `[${first},0x${first.slice(2).toUpperCase()},${second}]`),
      ),
    ).toEqual([
      {
        address: first,
        role: "recipient parameter",
        source: "parameter",
      },
      {
        address: second,
        role: "recipient parameter",
        source: "parameter",
      },
    ]);
  });

  it("uses a reviewed registry role when an exact identity exists", () => {
    expect(
      decodedAddressFields(
        50,
        parameter(
          "address",
          "0xf9c5E4f6E627201aB2d6FB6391239738Cf4bDcf9",
          "router",
        ),
      ),
    ).toEqual([
      {
        address: "0xf9c5E4f6E627201aB2d6FB6391239738Cf4bDcf9",
        role: "dex router",
        source: "registry",
      },
    ]);
  });

  it("does not scan bytes or unrelated text for address-shaped values", () => {
    const embedded = "0x1111111111111111111111111111111111111111";

    expect(decodedAddressFields(50, parameter("bytes", embedded))).toEqual([]);
    expect(decodedAddressFields(50, parameter("uint256", embedded))).toEqual([]);
  });

  it("bounds extracted address arrays", () => {
    const values = Array.from(
      { length: 40 },
      (_, index) => `0x${index.toString(16).padStart(40, "0")}`,
    );

    expect(
      decodedAddressFields(50, parameter("address[]", values.join(","))),
    ).toHaveLength(32);
  });
});
