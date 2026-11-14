import { describe, expect, it } from "vitest";

import { safeAddressBookPath } from "@/lib/navigation";

describe("Safe navigation", () => {
  it("opens the dedicated address-book approval page", () => {
    expect(
      safeAddressBookPath(50, "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173"),
    ).toBe("/safe/50/0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173/address-book");
  });
});
