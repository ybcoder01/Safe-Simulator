import { describe, expect, it } from "vitest";

import { config } from "../../../src/proxy";

describe("security proxy coverage", () => {
  it("applies the nonce CSP to API responses as well as pages", () => {
    const matcher = config.matcher[0];

    expect(matcher).toBeDefined();
    if (!matcher) throw new Error("Expected the security proxy matcher.");

    expect(matcher.source).not.toContain("api|");
    expect(matcher.source).toContain("_next/static");
  });
});
