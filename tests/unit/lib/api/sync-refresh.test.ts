import { describe, expect, it } from "vitest";

import type { SafeRef } from "../../../../src/core/domain";
import {
  isSafeBookmarked,
  refreshIdempotencyKey,
  SYNC_REFRESH_WINDOW_MS,
} from "../../../../src/lib/api/sync-refresh";

const safe: SafeRef = {
  chainId: 50,
  address: "0xc8bAe80ca5c2C9eC3bd4AC16c422220a33b6B173",
};

describe("on-demand synchronization refresh", () => {
  it("authorizes only an exact chain and case-insensitive address bookmark", () => {
    expect(
      isSafeBookmarked(
        [
          {
            chainId: 50,
            address: "0xc8bae80ca5c2c9ec3bd4ac16c422220a33b6b173",
          },
        ],
        safe,
      ),
    ).toBe(true);
    expect(isSafeBookmarked([{ ...safe, chainId: 1 }], safe)).toBe(false);
    expect(
      isSafeBookmarked(
        [
          {
            chainId: 50,
            address: "0x1111111111111111111111111111111111111111",
          },
        ],
        safe,
      ),
    ).toBe(false);
  });

  it("deduplicates refreshes in one five-minute bucket", () => {
    const start = SYNC_REFRESH_WINDOW_MS * 10 + 1;
    expect(refreshIdempotencyKey(safe, start)).toBe(
      refreshIdempotencyKey(safe, start + SYNC_REFRESH_WINDOW_MS - 2),
    );
    expect(refreshIdempotencyKey(safe, start)).not.toBe(
      refreshIdempotencyKey(safe, start + SYNC_REFRESH_WINDOW_MS),
    );
    expect(refreshIdempotencyKey(safe, start)).toContain(
      safe.address.toLowerCase(),
    );
  });
});
