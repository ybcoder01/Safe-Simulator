import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getPersistencePort,
  getQueuePort,
  getRateLimitPort,
  getSlackDeliveryPort,
} from "@/container";
import { parseProfileId, PROFILE_COOKIE } from "@/lib/api/profile";
import {
  checkRequestRateLimit,
  rateLimitHeaders,
  TELEGRAM_LINK_RATE_LIMIT,
} from "@/lib/api/rate-limit";
import { safeRouteParamsSchema } from "@/lib/api/safe-details";
import { isSafeBookmarked } from "@/lib/api/sync-refresh";
import { ensureTelegramWatch } from "@/lib/api/telegram-webhook";

interface RouteContext {
  readonly params: Promise<{ chainId: string; address: string }>;
}

const actionSchema = z.object({
  action: z.enum(["check", "test", "pause", "resume", "disconnect"]),
});

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
      { error: { message: "This Slack alert request is invalid." } },
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
  const subscriptions = await persistence.listSlackSubscriptionsForProfile(
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
              await getSlackDeliveryPort().sendMessage({
                channelId: subscription.channelId,
                text: [
                  "✅ SAFE INSPECTOR TEST ALERT",
                  "",
                  "Slack delivery is connected for this Safe.",
                  "This is only a test. No transaction was created, signed, or executed.",
                  "",
                  `Safe: ${safe.data.address.slice(0, 8)}…${safe.data.address.slice(-6)}`,
                ].join("\n"),
              });
              await persistence.recordSlackDeliveryResult(
                subscription.id,
                now,
                null,
              );
            } catch (error) {
              await persistence.recordSlackDeliveryResult(
                subscription.id,
                now,
                "Slack did not accept the test alert. Reconnect this channel and try again.",
              );
              throw error;
            }
          }),
        );
        return NextResponse.json({
          data: {
            message: "Test alert sent. Check the connected Slack channel.",
          },
        });
      case "pause":
        await persistence.setSlackSubscriptionsEnabled(
          profileId,
          safe.data,
          false,
        );
        return NextResponse.json({ data: { message: "Slack alerts paused." } });
      case "resume":
        if (subscriptions.length === 0) {
          return NextResponse.json(
            { error: { message: "Reconnect Slack before resuming alerts." } },
            { status: 409 },
          );
        }
        await persistence.setSlackSubscriptionsEnabled(
          profileId,
          safe.data,
          true,
        );
        await ensureTelegramWatch(safe.data, {
          queue: getQueuePort(),
          now: () => now,
        });
        return NextResponse.json({
          data: { message: "Slack alerts resumed." },
        });
      case "disconnect":
        await persistence.disconnectSlackSubscriptionsForProfile(
          profileId,
          safe.data,
          now,
        );
        return NextResponse.json({ data: { message: "Slack disconnected." } });
    }
  } catch (error) {
    console.error("Slack alert control failed.", {
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
              ? "The test alert could not be delivered. Reconnect Slack and try again."
              : "The Slack alert setting could not be changed right now.",
        },
      },
      { status: 503 },
    );
  }
}
