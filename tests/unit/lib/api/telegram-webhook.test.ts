import { describe, expect, it, vi } from "vitest";

import type { Address } from "../../../../src/core/domain";
import { hashTelegramLinkToken } from "../../../../src/lib/api/telegram-link";
import { handleTelegramCommand } from "../../../../src/lib/api/telegram-webhook";

describe("handleTelegramCommand", () => {
  it("consumes a single-use link, starts watching, and confirms setup", async () => {
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job" });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const consume = vi.fn().mockResolvedValue({
      id: "subscription",
      profileId: "profile",
      safe: {
        chainId: 50,
        address: "0x1111111111111111111111111111111111111111" as Address,
      },
      chatId: "42",
      enabled: true,
      createdAt: 100,
    });

    await handleTelegramCommand("42", "/start secret-code", {
      persistence: {
        consumeTelegramLinkToken: consume,
        disableTelegramSubscriptionsForChat: vi.fn(),
        listTelegramSubscriptionsForChat: vi.fn(),
      },
      queue: { enqueue },
      telegram: { sendMessage },
      now: () => 120,
    });

    expect(consume).toHaveBeenCalledWith(
      hashTelegramLinkToken("secret-code"),
      "42",
      120,
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ type: "telegram-watch" }),
      expect.any(Object),
    );
    expect(sendMessage.mock.calls[0]?.[0].text).toContain("Alerts enabled");
  });
});
