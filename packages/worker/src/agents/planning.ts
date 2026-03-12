import type { Agent, AgentContext, SSEEvent, ToolDefinition } from "../types";
import { allToolDefinitions } from "../tools";
import { createLLMProvider } from "./llm-provider";
import { runAgent } from "./runner";

const PLANNING_TOOLS = [
  "search_jira_issues",
  "get_team_capacity",
  "search_confluence_pages",
  "generate_plan",
];

const SYSTEM_PROMPT = `You are PlanBot's Planning Agent, a specialist in creating and refining project plans.

Your capabilities:
- Search Jira for issues relevant to a plan
- Look up team capacity and availability
- Search Confluence for project documentation and context
- Generate structured project plans with timelines, risks, and resource allocation

Workflow:
1. Understand what needs to be planned (release, sprint, specific scope)
2. Gather data: search Jira issues, check team capacity, review Confluence docs
3. Generate a comprehensive plan using the generate_plan tool
4. Present the results clearly with key risks and recommendations

Always gather sufficient context before generating a plan. Ask clarifying questions if the scope is unclear.
When presenting results, highlight:
- Key risks and blockers
- Resource allocation concerns
- Timeline dependencies
- Confidence level and assumptions`;

export function createPlanningAgent(): Agent {
  const tools: ToolDefinition[] = allToolDefinitions.filter((t) =>
    PLANNING_TOOLS.includes(t.name),
  );

  return {
    name: "planning",
    description: "Creates and refines project plans with timelines and risk analysis",
    systemPrompt: SYSTEM_PROMPT,
    tools,
    async *run(context: AgentContext): AsyncIterable<SSEEvent> {
      const provider = createLLMProvider(context.env);
      yield* runAgent(this, context, provider);
    },
  };
}
