import { describe, expect, it } from "vitest";

import {
  MAX_SOURCE_EVIDENCE_ADDRESSES,
  sourceEvidenceRequestBody,
} from "../../../../src/lib/api/xdc-source-evidence-request";

const references = (count: number) =>
  Array.from(
    { length: count },
    (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`,
  );

describe("sourceEvidenceRequestBody", () => {
  it("caps the request at 16 addresses", () => {
    expect(MAX_SOURCE_EVIDENCE_ADDRESSES).toBe(16);
  });

  it("truncates 17 or more references to the first 16, keeping the target first", () => {
    for (const count of [17, 20, 40]) {
      const all = references(count);
      const body = JSON.parse(sourceEvidenceRequestBody(all)) as {
        addresses: string[];
      };
      expect(body.addresses).toHaveLength(16);
      expect(body.addresses).toEqual(all.slice(0, 16));
      expect(body.addresses[0]).toBe(all[0]);
    }
  });

  it("sends shorter lists unchanged", () => {
    expect(
      JSON.parse(sourceEvidenceRequestBody(references(5))).addresses,
    ).toEqual(references(5));
  });
});
