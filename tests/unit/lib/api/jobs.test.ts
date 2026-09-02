import { describe, expect, it } from "vitest";

import { queueJobSchema } from "../../../../src/lib/api/jobs";

const safe = {
  chainId: 50,
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
};

describe("queue job validation", () => {
  it("requires a stable run ID for incremental synchronization", () => {
    const job = {
      type: "incremental-sync",
      safe,
      runId:
        "sync:refresh:50:0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173:3000001",
    };

    expect(queueJobSchema.safeParse(job).success).toBe(true);
    expect(
      queueJobSchema.safeParse({
        type: "incremental-sync",
        safe,
      }).success,
    ).toBe(false);
    expect(
      queueJobSchema.safeParse({
        ...job,
        runId: "invalid run id",
      }).success,
    ).toBe(false);
  });
});
