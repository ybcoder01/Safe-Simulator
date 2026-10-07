import { describe, expect, it, vi } from "vitest";

import type { Address } from "../../../../src/core/domain";
import { hashSlackLinkToken } from "../../../../src/lib/api/slack-link";
import { handleSlackCommand } from "../../../../src/lib/api/slack-webhook";
import {
  TELEGRAM_SWEEP_CRON,
  TELEGRAM_SWEEP_SCHEDULE_ID,
} from "../../../../src/lib/api/telegram-schedule";

const safe = {
  chainId: 50,
  address: "0x1111111111111111111111111111111111111111" as Address,
};

function queue() {
  return {
    enqueue: vi.fn().mockResolvedValue({ jobId: "job" }),
    schedule: vi.fn().mockResolvedValue({ scheduleId: "schedule" }),
    deleteSchedule: vi.fn().mockResolvedValue(undefined),
  };
}

describe("handleSlackCommand", () => {
  it("consumes a one-use code for the requesting workspace and channel", async () => {
    const consumeSlackLinkToken = vi.fn().mockResolvedValue({
      id: "subscription",
      profileId: "profile",
      safe,
      teamId: "T123",
      channelId: "C123",
      channelLabel: "#signers",
      enabled: true,
      disconnectedAt: null,
      lastPolledAt: null,
      lastPollError: null,
      lastDeliveryAttemptAt: null,
      lastDeliveryError: null,
      createdAt: 120,
    });
    const recurringQueue = queue();

    const response = await handleSlackCommand(
      {
        teamId: "T123",
        channelId: "C123",
        channelLabel: "#signers",
        text: "connect secret-code",
      },
      {
        persistence: {
          consumeSlackLinkToken,
          disableSlackSubscriptionsForChannel: vi.fn(),
          listSlackSubscriptionsForChannel: vi.fn(),
        },
        queue: recurringQueue,
        now: () => 120,
      },
    );

    expect(consumeSlackLinkToken).toHaveBeenCalledWith(
      hashSlackLinkToken("secret-code"),
      "T123",
      "C123",
      "#signers",
      120,
    );
    expect(recurringQueue.schedule).toHaveBeenCalledWith(
      { type: "telegram-sweep", cursor: null },
      {
        scheduleId: TELEGRAM_SWEEP_SCHEDULE_ID,
        cron: TELEGRAM_SWEEP_CRON,
      },
    );
    expect(response).toContain("alerts enabled for this channel");
  });

  it("lists only subscriptions bound to the requesting workspace and channel", async () => {
    const listSlackSubscriptionsForChannel = vi.fn().mockResolvedValue([
      {
        id: "subscription",
        profileId: "profile",
        safe,
        teamId: "T123",
        channelId: "C123",
        channelLabel: "#signers",
        enabled: true,
        disconnectedAt: null,
        lastPolledAt: null,
        lastPollError: null,
        lastDeliveryAttemptAt: null,
        lastDeliveryError: null,
        createdAt: 100,
      },
    ]);

    const response = await handleSlackCommand(
      {
        teamId: "T123",
        channelId: "C123",
        channelLabel: "#signers",
        text: "list",
      },
      {
        persistence: {
          consumeSlackLinkToken: vi.fn(),
          disableSlackSubscriptionsForChannel: vi.fn(),
          listSlackSubscriptionsForChannel,
        },
        queue: queue(),
        now: () => 120,
      },
    );

    expect(listSlackSubscriptionsForChannel).toHaveBeenCalledWith(
      "T123",
      "C123",
    );
    expect(response).toContain(safe.address);
  });

  it("stops alerts only in the requesting workspace and channel", async () => {
    const disableSlackSubscriptionsForChannel = vi.fn().mockResolvedValue(2);

    const response = await handleSlackCommand(
      {
        teamId: "T123",
        channelId: "C123",
        channelLabel: "#signers",
        text: "stop",
      },
      {
        persistence: {
          consumeSlackLinkToken: vi.fn(),
          disableSlackSubscriptionsForChannel,
          listSlackSubscriptionsForChannel: vi.fn(),
        },
        queue: queue(),
        now: () => 120,
      },
    );

    expect(disableSlackSubscriptionsForChannel).toHaveBeenCalledWith(
      "T123",
      "C123",
    );
    expect(response).toBe("Alerts stopped for 2 Safes in this channel.");
  });
});
