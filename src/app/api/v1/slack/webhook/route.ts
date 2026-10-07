import { readSlackWebhook } from "@chat-adapter/slack/webhook";
import { sendSlackResponseUrl } from "@chat-adapter/slack/api";
import { after } from "next/server";

import { slackSigningSecret } from "@/adapters/slack-bot/client";
import { getPersistencePort, getQueuePort } from "@/container";
import { handleSlackCommand } from "@/lib/api/slack-webhook";

export async function POST(request: Request) {
  let payload;
  try {
    payload = await readSlackWebhook(request, {
      signingSecret: slackSigningSecret(),
    });
  } catch (error) {
    console.error("Slack webhook verification failed.", {
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) },
    });
    return Response.json({ ok: false }, { status: 401 });
  }

  if (payload.kind === "url_verification") {
    return Response.json({ challenge: payload.challenge });
  }
  if (payload.kind !== "slash_command") {
    return Response.json({ ok: true });
  }
  if (payload.command !== "/safe-alerts" || !payload.teamId) {
    return Response.json({
      response_type: "ephemeral",
      text: "This Slack command is not configured for Safe Inspector.",
    });
  }
  const teamId = payload.teamId;

  const handle = async () => {
    try {
      return await handleSlackCommand(
        {
          teamId,
          channelId: payload.channelId,
          channelLabel: payload.channelName ? `#${payload.channelName}` : null,
          text: payload.text,
        },
        {
          persistence: getPersistencePort(),
          queue: getQueuePort(),
          now: () => Math.floor(Date.now() / 1_000),
        },
      );
    } catch (error) {
      console.error("Slack command handling failed.", {
        teamId,
        channelId: payload.channelId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: String(error) },
      });
      return "Safe Inspector could not update Slack alerts right now. Try again shortly.";
    }
  };

  if (payload.responseUrl) {
    const responseUrl = payload.responseUrl;
    after(async () => {
      const text = await handle();
      await sendSlackResponseUrl(responseUrl, {
        responseType: "ephemeral",
        replaceOriginal: true,
        text,
      });
    });
    return Response.json({
      response_type: "ephemeral",
      text: "Safe Inspector is checking that request…",
    });
  }

  return Response.json({ response_type: "ephemeral", text: await handle() });
}
