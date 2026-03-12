import type { PlanningResult, SlackBlock } from "./types";

const MAX_TASKS_SHOWN = 20;
const MAX_RISKS_SHOWN = 10;
const MAX_BLOCKS = 50;

function statusEmoji(status: string): string {
  switch (status) {
    case "on_track": return ":white_check_mark:";
    case "at_risk": return ":warning:";
    case "blocked": return ":no_entry:";
    case "completed": return ":heavy_check_mark:";
    default: return ":grey_question:";
  }
}

function severityEmoji(severity: string): string {
  switch (severity) {
    case "high": return ":red_circle:";
    case "medium": return ":large_orange_circle:";
    case "low": return ":large_yellow_circle:";
    default: return ":white_circle:";
  }
}

export function formatPlanBlocks(result: PlanningResult): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: result.title, emoji: true },
  });

  // Summary
  blocks.push({
    type: "section",
    fields: [
      { type: "mrkdwn", text: `*Tasks:* ${result.summary.total_tasks}` },
      { type: "mrkdwn", text: `*Team Size:* ${result.summary.team_size}` },
      { type: "mrkdwn", text: `*At Risk:* ${result.summary.at_risk_count}` },
      { type: "mrkdwn", text: `*Blocked:* ${result.summary.blocked_count}` },
      { type: "mrkdwn", text: `*Confidence:* ${result.summary.completion_confidence}%` },
      { type: "mrkdwn", text: `*Horizon:* ${result.horizon.from} → ${result.horizon.to}` },
    ],
  });

  blocks.push({ type: "divider" });

  // Tasks
  if (result.tasks.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Planned Tasks*" },
    });

    const tasksToShow = result.tasks.slice(0, MAX_TASKS_SHOWN);
    for (const task of tasksToShow) {
      if (blocks.length >= MAX_BLOCKS - 2) break;
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${statusEmoji(task.status)} *${task.key}* — ${task.summary}\n_${task.owner}_ | ${task.start_date} → ${task.due_date} | BDG: ${task.bdg} EAC: ${task.eac}`,
        },
      });
    }

    if (result.tasks.length > MAX_TASKS_SHOWN) {
      blocks.push({
        type: "context",
        elements: [
          { type: "mrkdwn", text: `_...and ${result.tasks.length - MAX_TASKS_SHOWN} more tasks (see Excel attachment)_` },
        ],
      });
    }
  }

  // Risks
  if (result.risks.length > 0 && blocks.length < MAX_BLOCKS - 2) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Risks*" },
    });

    const risksToShow = result.risks.slice(0, MAX_RISKS_SHOWN);
    for (const risk of risksToShow) {
      if (blocks.length >= MAX_BLOCKS) break;
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${severityEmoji(risk.severity)} *${risk.type}* — ${risk.description}\n_Mitigation: ${risk.mitigation}_`,
        },
      });
    }
  }

  return blocks.slice(0, MAX_BLOCKS);
}

export async function postToResponseUrl(
  url: string,
  blocks: SlackBlock[],
  text: string,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "in_channel", blocks, text }),
  });

  if (!res.ok) {
    throw new Error(`Slack response_url failed: ${res.status} ${await res.text()}`);
  }
}

export async function uploadFile(
  channelId: string,
  filename: string,
  content: ArrayBuffer,
  botToken: string,
): Promise<void> {
  // Step 1: Get upload URL
  const urlRes = await fetch(
    `https://slack.com/api/files.getUploadURLExternal?filename=${encodeURIComponent(filename)}&length=${content.byteLength}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${botToken}` },
    },
  );

  const urlData = (await urlRes.json()) as {
    ok: boolean;
    upload_url: string;
    file_id: string;
    error?: string;
  };

  if (!urlData.ok) {
    throw new Error(`Slack getUploadURLExternal failed: ${urlData.error}`);
  }

  // Step 2: Upload file content
  const uploadRes = await fetch(urlData.upload_url, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: content,
  });

  if (!uploadRes.ok) {
    throw new Error(`Slack file upload failed: ${uploadRes.status}`);
  }

  // Step 3: Complete upload
  const completeRes = await fetch("https://slack.com/api/files.completeUploadExternal", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: [{ id: urlData.file_id, title: filename }],
      channel_id: channelId,
    }),
  });

  const completeData = (await completeRes.json()) as { ok: boolean; error?: string };
  if (!completeData.ok) {
    throw new Error(`Slack completeUploadExternal failed: ${completeData.error}`);
  }
}
