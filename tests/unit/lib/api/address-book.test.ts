import { describe, expect, it } from "vitest";

import {
  addressBookDeleteSchema,
  addressBookInputSchema,
  availableAddressBookSuggestions,
  resolveAddressDisplay,
  suggestedAddressBookLabel,
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

  it("prefers a profile label over a registry record", () => {
    const registryAddress = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

    expect(
      resolveAddressDisplay(1, registryAddress, [
        {
          address: registryAddress.toLowerCase(),
          label: "Reviewed batch executor",
          trust: "flagged",
        },
      ]),
    ).toEqual({
      label: "Reviewed batch executor",
      trust: "flagged",
      source: "profile",
    });
  });

  it("uses the pinned registry only when no profile record exists", () => {
    expect(
      resolveAddressDisplay(
        50,
        "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526",
        [],
      ),
    ).toEqual({
      label: "Safe v1.4.1 MultiSend",
      trust: "known",
      source: "registry",
    });
  });

  it("leaves malformed, unsupported-chain, and unknown targets unlabeled", () => {
    expect(resolveAddressDisplay(1, "not-an-address", [])).toBeNull();
    expect(resolveAddressDisplay(10, address, [])).toBeNull();
    expect(resolveAddressDisplay(1, address, [])).toBeNull();
  });

  it("accepts only an EVM address for deletion", () => {
    expect(addressBookDeleteSchema.parse({ address })).toEqual({ address });
    expect(addressBookDeleteSchema.safeParse({ address: "nope" }).success).toBe(
      false,
    );
  });
});

describe("address book suggestions", () => {
  it("keeps existing labels and creates a bounded fallback label", () => {
    expect(
      suggestedAddressBookLabel({
        address,
        label: "Pinned protocol",
        roles: ["target"],
      }),
    ).toBe("Pinned protocol");
    expect(
      suggestedAddressBookLabel({
        address,
        label: null,
        roles: ["internal-call"],
      }),
    ).toBe("Internal call 0x11111111…11111111");
  });

  it("excludes configured addresses and case-insensitive duplicates", () => {
    const candidate = {
      address,
      label: null,
      roles: ["target"],
    };

    expect(
      availableAddressBookSuggestions(
        [candidate, { ...candidate, address: address.toUpperCase() }],
        [],
      ),
    ).toEqual([candidate]);
    expect(
      availableAddressBookSuggestions([candidate], [
        {
          address: address.toUpperCase(),
          label: "Existing",
          trust: "trusted",
        },
      ]),
    ).toEqual([]);
  });
});

