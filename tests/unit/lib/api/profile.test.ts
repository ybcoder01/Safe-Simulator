import { describe, expect, it } from "vitest";

import { parseProfileId } from "../../../../src/lib/api/profile";

describe("parseProfileId", () => {
  it("accepts UUID profile identifiers", () => {
    expect(parseProfileId("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("rejects missing and malformed cookie values", () => {
    expect(parseProfileId(undefined)).toBeNull();
    expect(parseProfileId("not-a-profile")).toBeNull();
  });
});
