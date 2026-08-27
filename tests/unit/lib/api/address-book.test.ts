import { describe, expect, it } from "vitest";

import {
  addressBookDeleteSchema,
  addressBookInputSchema,
} from "../../../../src/lib/api/address-book";

const address = "0x1111111111111111111111111111111111111111";

describe("address book schemas", () => {
  it("accepts a bounded label and explicit classification", () => {
    expect(
      addressBookInputSchema.parse({
        address,
        label: "  Treasury router  ",
        trust: "trusted",
      }),
    ).toEqual({
      address,
      label: "Treasury router",
      trust: "trusted",
    });
  });

  it("rejects malformed addresses, empty labels, and unknown classifications", () => {
    expect(
      addressBookInputSchema.safeParse({
        address: "0x1234",
        label: "",
        trust: "known",
      }).success,
    ).toBe(false);
  });

  it("accepts only an EVM address for deletion", () => {
    expect(addressBookDeleteSchema.parse({ address })).toEqual({ address });
    expect(addressBookDeleteSchema.safeParse({ address: "nope" }).success).toBe(
      false,
    );
  });
});
