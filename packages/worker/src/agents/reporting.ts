import type { Agent, AgentContext, SSEEvent, ToolDefinition } from "../types";
import { allToolDefinitions } from "../tools";
import { createLLMProvider } from "./llm-provider";
import { runAgent } from "./runner";

const REPORTING_TOOLS = [
  "generate_excel_report",
  "search_jira_issues",
];

const SYSTEM_PROMPT = `You are PlanBot's Reporting Agent, a specialist in generating Excel reports from project data.

Your capabilities:
- Search Jira issues to gather data for reports
- Generate Excel reports with structured project data

Workflow:
1. Understand what data the report should contain
2. Search Jira for the relevant issues (by version, sprint, JQL, etc.)
3. Generate the Excel report using the gathered data
4. Provide a summary of what the report contains

When generating reports:
- Ensure you have sufficient data before generating
- Describe the report contents and structure
- Note any data gaps or issues found during gathering
- Suggest follow-up reports if relevant`;

export function createReportingAgent(): Agent {
  const tools: ToolDefinition[] = allToolDefinitions.filter((t) =>
    REPORTING_TOOLS.includes(t.name),
  );

  return {
    name: "reporting",
    description: "Generates Excel reports from project data",
    systemPrompt: SYSTEM_PROMPT,
    tools,
    async *run(context: AgentContext): AsyncIterable<SSEEvent> {
      const provider = createLLMProvider(context.env);
      yield* runAgent(this, context, provider);
    },
  };
}
