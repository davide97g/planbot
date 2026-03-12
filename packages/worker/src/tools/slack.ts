import {
  createToolDefinition,
  parametersSchema,
  stringProp,
} from "@planbot/shared/tool-schemas";
import type { Env, ToolDefinition } from "../types";

export const tools: ToolDefinition[] = [
  createToolDefinition(
    "send_slack_message",
    "Send a formatted message to a Slack channel. Use Slack mrkdwn syntax for formatting (bold: *text*, italic: _text_, code: `text`, links: <url|label>). The message will be posted as the PlanBot bot.",
    parametersSchema(
      {
        channel: stringProp({
          description: "Slack channel name (e.g. #general) or channel ID",
        }),
        text: stringProp({
          description:
            "The message text in Slack mrkdwn format. Use *bold*, _italic_, bullet lists with •, and <url|label> for links.",
        }),
      },
      ["channel", "text"],
    ),
  ),
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env,
): Promise<unknown> {
  switch (name) {
    case "send_slack_message": {
      const channel = args.channel as string;
      const text = args.text as string;

      if (!env.SLACK_BOT_TOKEN) {
        throw new Error(
          "SLACK_BOT_TOKEN is not configured. Add it to your environment variables.",
        );
      }

      // Resolve channel name to ID if needed (strip leading #)
      let channelId = channel.replace(/^#/, "");

      // If it doesn't look like an ID (Cxxxxxxx), look it up by name
      if (!/^[A-Z0-9]{9,}$/i.test(channelId)) {
        const lookupRes = await fetch(
          `https://slack.com/api/conversations.list?types=public_channel&limit=200`,
          {
            headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
          },
        );
        const lookupData = (await lookupRes.json()) as {
          ok: boolean;
          channels?: { id: string; name: string }[];
          error?: string;
        };

        if (!lookupData.ok) {
          throw new Error(`Slack conversations.list failed: ${lookupData.error}`);
        }

        const found = lookupData.channels?.find(
          (c) => c.name === channelId,
        );
        if (!found) {
          throw new Error(
            `Channel "${channel}" not found. Make sure PlanBot is invited to the channel.`,
          );
        }
        channelId = found.id;
      }

      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel: channelId,
          text,
          // Also send as blocks for richer formatting
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text },
            },
          ],
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        ts?: string;
        channel?: string;
        error?: string;
      };

      if (!data.ok) {
        throw new Error(`Slack chat.postMessage failed: ${data.error}`);
      }

      return {
        success: true,
        channel: data.channel,
        timestamp: data.ts,
        message: `Message sent to ${channel}`,
      };
    }
    default:
      throw new Error(`Unknown slack tool: ${name}`);
  }
}
