import { describe, expect, it } from "vitest";

import { withoutSafe } from "../../../../src/lib/api/safes";

describe("Safe watchlist views", () => {
  it("removes only the matching chain and address, case-insensitively", () => {
    const items = [
      {
        chainId: 1,
        address: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        label: "Ethereum",
      },
      {
        chainId: 50,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        label: "XDC",
      },
      {
        chainId: 1,
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        label: "Other",
      },
    ];

    expect(
      withoutSafe(items, {
        chainId: 1,
        address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toEqual([items[1], items[2]]);
  });

  it("is idempotent when the target is not present", () => {
    const items = [{ chainId: 1, address: "0x1111" }];

    expect(withoutSafe(items, { chainId: 50, address: "0x1111" })).toEqual(
      items,
    );
  });
});
