import { describe, expect, it } from "vitest";

import { toQStashDeduplicationId } from "../../../../src/adapters/queue-qstash/queue";

describe("toQStashDeduplicationId", () => {
  it("converts application idempotency keys into deterministic QStash-safe IDs", async () => {
    const value =
      "sync:import:50:0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173:multisig";

    await expect(toQStashDeduplicationId(value)).resolves.toBe(
      "a603354acab855ef9e9824bbbae0a026a3421a5de904a45416f3c667ecafb447",
    );
  });

  it("keeps distinct application keys distinct", async () => {
    const first = await toQStashDeduplicationId("sync:import:50:first");
    const second = await toQStashDeduplicationId("sync:import:50:second");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });
});
