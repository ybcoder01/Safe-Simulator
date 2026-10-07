import { describe, expect, it, vi } from "vitest";

import type { Address } from "../../../../src/core/domain";
import {
  createSlackLink,
  hashSlackLinkToken,
  SLACK_LINK_TTL_SECONDS,
} from "../../../../src/lib/api/slack-link";

describe("Slack link tokens", () => {
  it("stores only the token hash and returns a short-lived one-use command", async () => {
    const createSlackLinkToken = vi.fn().mockResolvedValue(undefined);
    const safe = {
      chainId: 50,
      address: "0x1111111111111111111111111111111111111111" as Address,
    };

    const link = await createSlackLink(
      { createSlackLinkToken },
      { profileId: "profile", safe, now: 100, token: "secret-code" },
    );

    expect(link).toEqual({
      command: "/safe-alerts connect secret-code",
      expiresAt: 100 + SLACK_LINK_TTL_SECONDS,
    });
    expect(createSlackLinkToken).toHaveBeenCalledWith({
      tokenHash: hashSlackLinkToken("secret-code"),
      profileId: "profile",
      safe,
      expiresAt: 100 + SLACK_LINK_TTL_SECONDS,
    });
    expect(createSlackLinkToken.mock.calls[0]?.[0]).not.toHaveProperty("token");
  });
});
