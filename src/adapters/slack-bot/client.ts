import { postSlackMessage } from "@chat-adapter/slack/api";

import type { SlackDeliveryPort } from "@/core/ports";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function slackSigningSecret(): string {
  return requiredEnvironment("SLACK_SIGNING_SECRET");
}

export class SlackBotAdapter implements SlackDeliveryPort {
  private readonly token: string;

  constructor() {
    this.token = requiredEnvironment("SLACK_BOT_TOKEN");
  }

  async sendMessage(input: {
    readonly channelId: string;
    readonly text: string;
    readonly verificationUrl?: string;
  }): Promise<void> {
    await postSlackMessage({
      token: this.token,
      channel: input.channelId,
      text: input.text,
      markdownText: input.text,
      unfurlLinks: false,
      unfurlMedia: false,
      ...(input.verificationUrl
        ? {
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: input.text },
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: {
                      type: "plain_text",
                      text: "Open verified safety report",
                    },
                    url: input.verificationUrl,
                    action_id: "open_verified_report",
                  },
                ],
              },
            ],
          }
        : {}),
    });
  }
}
