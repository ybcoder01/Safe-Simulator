import { describe, expect, it } from "vitest";

import type { SafeMessage } from "../../../../src/core/domain";
import {
  messageHashSchema,
  messagePageQuerySchema,
  toMessageView,
} from "../../../../src/lib/api/message-details";

const message = (payload: string, owners: readonly string[]) =>
  ({
    safe: {
      chainId: 50,
      address: "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173",
    },
    messageHash: `0x${"a".repeat(64)}`,
    payload,
    confirmations: owners.map((owner, index) => ({
      owner,
      signature: `0x${String(index + 1).padStart(2, "0")}`,
      signedAt: 1_700_000_000 + index,
    })),
    createdAt: 1_700_000_000,
  }) as SafeMessage;

describe("signed-message API view models", () => {
  it("normalizes valid hashes and rejects malformed hashes", () => {
    expect(messageHashSchema.parse(`0x${"A".repeat(64)}`)).toBe(
      `0x${"a".repeat(64)}`,
    );
    expect(messageHashSchema.safeParse("0x1234").success).toBe(false);
  });

  it("accepts bounded pagination and rejects unsafe limits", () => {
    expect(messagePageQuerySchema.parse({ cursor: null, limit: "25" })).toEqual(
      { cursor: null, limit: 25 },
    );
    expect(
      messagePageQuerySchema.safeParse({ cursor: null, limit: "101" }).success,
    ).toBe(false);
  });

  it("formats structured payloads without changing the stored value", () => {
    const payload = '{"domain":"example","action":"login"}';
    const view = toMessageView(
      message(payload, ["0x1111111111111111111111111111111111111111"]),
      2,
    );

    expect(view.payload).toBe(payload);
    expect(view.payloadKind).toBe("structured");
    expect(view.payloadDisplay).toContain('"domain": "example"');
    expect(view.reportedConfirmationCountMeetsCurrentThreshold).toBe(false);
  });

  it("deduplicates reported owners case-insensitively", () => {
    const view = toMessageView(
      message("0x1234", [
        "0x1111111111111111111111111111111111111111",
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ]),
      2,
    );

    expect(view.payloadKind).toBe("hex");
    expect(view.confirmationCount).toBe(2);
    expect(view.reportedConfirmationCountMeetsCurrentThreshold).toBe(true);
  });

  it("does not claim cryptographic validity from confirmation count", () => {
    const view = toMessageView(
      message("hello", [
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      ]),
      2,
    );

    expect(view).not.toHaveProperty("valid");
    expect(view).not.toHaveProperty("verified");
    expect(view.reportedConfirmationCountMeetsCurrentThreshold).toBe(true);
  });
});
