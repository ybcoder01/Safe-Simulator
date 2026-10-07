import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getPersistencePort,
  getQueuePort,
  getRateLimitPort,
  getTelegramDeliveryPort,
} from "@/container";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  TELEGRAM_LINK_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import { isSafeBookmarked } from "@/lib/api/sync-refresh";
import {
  ensureTelegramWatch,
  telegramWatchScheduleId,
} from "@/lib/api/telegram-webhook";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

const actionSchema = z.object({
  action: z.enum(["check", "test", "pause", "resume", "disconnect"]),
});

async function removeUnusedSchedule(chainId: number, address: string) {
  const persistence = getPersistencePort();
  const remaining = await persistence.listTelegramSubscriptions({
    chainId,
    address: address as `0x${string}`,
  });
  if (remaining.length === 0) {
    const scheduleId = telegramWatchScheduleId(chainId, address);
    try {
      await getQueuePort().deleteSchedule(scheduleId);
    } catch (error) {
      console.error("Unused Telegram schedule could not be removed.", {
        chainId,
        safe: address,
        scheduleId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
    }
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const [safe, input] = await Promise.all([
    safeRouteParamsSchema.safeParseAsync(await context.params),
    request
      .json()
      .then((value) => actionSchema.safeParse(value))
      .catch(() => actionSchema.safeParse(null)),
  ]);
  if (!safe.success || !input.success) {
    return NextResponse.json(
      { error: { message: "This Telegram alert request is invalid." } },
      { status: 400 },
    );
  }

  const profileId = parseProfileId(request.cookies.get(PROFILE_COOKIE)?.value);
  if (!profileId) {
    return NextResponse.json(
      { error: { message: "This Safe is not in the current watchlist." } },
      { status: 404 },
    );
  }

  const rateLimit = await checkRequestRateLimit(
    getRateLimitPort(),
    request,
    TELEGRAM_LINK_RATE_LIMIT,
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: { message: "Too many alert requests. Try again later." } },
      {
        status: 429,
        headers: rateLimitHeaders(TELEGRAM_LINK_RATE_LIMIT, rateLimit),
      },
    );
  }

  const persistence = getPersistencePort();
  const bookmarked = await persistence.listSafesForProfile(profileId);
  if (!isSafeBookmarked(bookmarked, safe.data)) {
    return NextResponse.json(
      { error: { message: "This Safe is not in the current watchlist." } },
      { status: 404 },
    );
  }

  const subscriptions = await persistence.listTelegramSubscriptionsForProfile(
    profileId,
    safe.data,
  );
  const active = subscriptions.filter((item) => item.enabled);
  const now = Math.floor(Date.now() / 1_000);

  try {
    switch (input.data.action) {
      case "check":
        if (active.length === 0) {
          return NextResponse.json(
            { error: { message: "Resume alerts before checking monitoring." } },
            { status: 409 },
          );
        }
        await ensureTelegramWatch(safe.data, {
          queue: getQueuePort(),
          now: () => now,
        });
        return NextResponse.json({
          data: {
            message: "Monitoring check queued. Status will update shortly.",
          },
        });

      case "test":
        if (active.length === 0) {
          return NextResponse.json(
            { error: { message: "Resume alerts before sending a test." } },
            { status: 409 },
          );
        }
        await Promise.all(
          active.map(async (subscription) => {
            try {
              await getTelegramDeliveryPort().sendMessage({
                chatId: subscription.chatId,
                text: [
                  "✅ SAFE INSPECTOR TEST ALERT",
                  "",
                  "Telegram delivery is connected for this Safe.",
                  "This is only a test. No transaction was created, signed, or executed.",
                  "",
                  `Safe: ${safe.data.address.slice(0, 8)}…${safe.data.address.slice(-6)}`,
                ].join("\n"),
              });
              await persistence.recordTelegramDeliveryResult(
                subscription.id,
                now,
                null,
              );
            } catch (error) {
              await persistence.recordTelegramDeliveryResult(
                subscription.id,
                now,
                "Telegram did not accept the test alert. Reconnect this chat and try again.",
              );
              throw error;
            }
          }),
        );
        return NextResponse.json({
          data: {
            message: "Test alert sent. Check the connected Telegram chat.",
          },
        });

      case "pause":
        if (subscriptions.length === 0) {
          return NextResponse.json(
            { error: { message: "No Telegram connection was found." } },
            { status: 404 },
          );
        }
        await persistence.setTelegramSubscriptionsEnabled(
          profileId,
          safe.data,
          false,
        );
        await removeUnusedSchedule(safe.data.chainId, safe.data.address);
        return NextResponse.json({
          data: { message: "Alerts paused for this Safe." },
        });

      case "resume":
        if (subscriptions.length === 0) {
          return NextResponse.json(
            {
              error: { message: "Reconnect Telegram before resuming alerts." },
            },
            { status: 409 },
          );
        }
        await persistence.setTelegramSubscriptionsEnabled(
          profileId,
          safe.data,
          true,
        );
        await ensureTelegramWatch(safe.data, {
          queue: getQueuePort(),
          now: () => now,
        });
        return NextResponse.json({
          data: { message: "Alerts resumed and monitoring was checked." },
        });

      case "disconnect":
        await persistence.disconnectTelegramSubscriptionsForProfile(
          profileId,
          safe.data,
          now,
        );
        await removeUnusedSchedule(safe.data.chainId, safe.data.address);
        return NextResponse.json({
          data: { message: "Telegram disconnected from this Safe." },
        });
    }
  } catch (error) {
    console.error("Telegram alert control failed.", {
      action: input.data.action,
      chainId: safe.data.chainId,
      safe: safe.data.address,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    return NextResponse.json(
      {
        error: {
          message:
            input.data.action === "test"
              ? "The test alert could not be delivered. Reconnect Telegram and try again."
              : "The alert setting could not be changed right now.",
        },
      },
      { status: 503 },
    );
  }
}
