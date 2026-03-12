import type { Agent, AgentContext, SSEEvent, ToolDefinition } from "../types";
import { allToolDefinitions } from "../tools";
import { createLLMProvider } from "./llm-provider";
import { runAgent } from "./runner";

const REPORTING_TOOLS = [
  "search_jira_issues",
  "search_by_version",
  "send_slack_message",
];

const SYSTEM_PROMPT = `You are PlanBot's Release Report Agent. Your job is to generate a release recap from Jira issues and send it to Slack.

## Workflow

1. **Find issues**: Use search_by_version with the version the user provides. If no version is given, use search_jira_issues with JQL: ORDER BY fixVersion DESC, updated DESC to find the latest issues and identify the most recent fix version, then search by that version.

2. **Format the recap**: Build a well-structured Slack message (mrkdwn format) with:
   - A header line with the version name and date
   - Group issues by type (Bug fixes, New features/Stories, Tasks, etc.)
   - Each issue as a bullet: \`• *KEY-123* — Summary (assignee)\`
   - A short stats line at the bottom (total issues, breakdown by type)

3. **Send to Slack**: Use the send_slack_message tool to post the recap to the channel the user specifies. If no channel is specified, ask which channel to send it to.

## Formatting rules
- Use Slack mrkdwn: *bold*, _italic_, \`code\`
- Keep it scannable — no long paragraphs
- Group by issue type with section headers like *🐛 Bug Fixes* or *✨ New Features*
- Include assignee names when available
- Add a divider line (———) between sections`;

export function createReportingAgent(): Agent {
  const tools: ToolDefinition[] = allToolDefinitions.filter((t) =>
    REPORTING_TOOLS.includes(t.name),
  );

  return {
    name: "reporting",
    description: "Generates release recaps and sends them to Slack",
    systemPrompt: SYSTEM_PROMPT,
    tools,
    async *run(context: AgentContext): AsyncIterable<SSEEvent> {
      const provider = createLLMProvider(context.env);
      yield* runAgent(this, context, provider);
    },
  };
}
