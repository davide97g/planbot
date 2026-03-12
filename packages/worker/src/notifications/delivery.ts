import type { Env } from "../types";

/**
 * Send a Slack DM to a user by their Slack user ID.
 * Uses conversations.open to get the DM channel, then chat.postMessage.
 */
export async function sendSlackDM(
  slackUserId: string,
  message: string,
  env: Env,
): Promise<void> {
  if (!env.SLACK_BOT_TOKEN) {
    throw new Error("SLACK_BOT_TOKEN is not configured");
  }

  // Open a DM conversation with the user
  const openRes = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: slackUserId }),
  });

  const openData = (await openRes.json()) as {
    ok: boolean;
    channel?: { id: string };
    error?: string;
  };

  if (!openData.ok || !openData.channel) {
    throw new Error(
      `Failed to open DM with ${slackUserId}: ${openData.error ?? "unknown"}`,
    );
  }

  const channelId = openData.channel.id;

  // Send the message
  const postRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: channelId,
      text: message,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: message },
        },
      ],
    }),
  });

  const postData = (await postRes.json()) as {
    ok: boolean;
    error?: string;
  };

  if (!postData.ok) {
    throw new Error(
      `Failed to send DM to ${slackUserId}: ${postData.error ?? "unknown"}`,
    );
  }
}
