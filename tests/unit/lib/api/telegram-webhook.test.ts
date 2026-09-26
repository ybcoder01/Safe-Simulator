import { describe, expect, it, vi } from "vitest";

import type { Address } from "../../../../src/core/domain";
import { hashTelegramLinkToken } from "../../../../src/lib/api/telegram-link";
import {
  handleTelegramCommand,
  telegramWatchScheduleId,
} from "../../../../src/lib/api/telegram-webhook";

describe("handleTelegramCommand", () => {
  it("consumes a single-use link, starts watching, and confirms setup", async () => {
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job" });
    const schedule = vi
      .fn()
      .mockResolvedValue({ scheduleId: "telegram-watch-id" });
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
        listTelegramSubscriptions: vi.fn(),
        listTelegramSubscriptionsForChat: vi.fn(),
      },
      queue: { enqueue, schedule, deleteSchedule: vi.fn() },
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
    expect(schedule).toHaveBeenCalledWith(
      expect.objectContaining({ type: "telegram-watch" }),
      {
        scheduleId: telegramWatchScheduleId(
          50,
          "0x1111111111111111111111111111111111111111",
        ),
        cron: "* * * * *",
      },
    );
    expect(sendMessage.mock.calls[0]?.[0].text).toContain("Alerts enabled");
  });

  it("repairs durable monitoring when /safes is requested", async () => {
    const safe = {
      chainId: 50,
      address: "0x1111111111111111111111111111111111111111" as Address,
    };
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job" });
    const schedule = vi.fn().mockResolvedValue({ scheduleId: "schedule" });
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    await handleTelegramCommand("42", "/safes", {
      persistence: {
        consumeTelegramLinkToken: vi.fn(),
        disableTelegramSubscriptionsForChat: vi.fn(),
        listTelegramSubscriptions: vi.fn(),
        listTelegramSubscriptionsForChat: vi.fn().mockResolvedValue([
          {
            id: "subscription",
            profileId: "profile",
            safe,
            chatId: "42",
            enabled: true,
            createdAt: 100,
          },
        ]),
      },
      queue: { enqueue, schedule, deleteSchedule: vi.fn() },
      telegram: { sendMessage },
      now: () => 120,
    });

    expect(schedule).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(sendMessage.mock.calls[0]?.[0].text).toContain(
      "Alert monitoring checked and active",
    );
  });

  it("removes the durable schedule after the last subscription stops", async () => {
    const safe = {
      chainId: 50,
      address: "0x1111111111111111111111111111111111111111" as Address,
    };
    const deleteSchedule = vi.fn().mockResolvedValue(undefined);

    await handleTelegramCommand("42", "/stop", {
      persistence: {
        consumeTelegramLinkToken: vi.fn(),
        disableTelegramSubscriptionsForChat: vi.fn().mockResolvedValue(1),
        listTelegramSubscriptions: vi.fn().mockResolvedValue([]),
        listTelegramSubscriptionsForChat: vi.fn().mockResolvedValue([
          {
            id: "subscription",
            profileId: "profile",
            safe,
            chatId: "42",
            enabled: true,
            createdAt: 100,
          },
        ]),
      },
      queue: {
        enqueue: vi.fn(),
        schedule: vi.fn(),
        deleteSchedule,
      },
      telegram: { sendMessage: vi.fn().mockResolvedValue(undefined) },
      now: () => 120,
    });

    expect(deleteSchedule).toHaveBeenCalledWith(
      telegramWatchScheduleId(safe.chainId, safe.address),
    );
  });
});
