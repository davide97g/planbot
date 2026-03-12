import {
  createToolDefinition,
  parametersSchema,
  stringProp,
} from "@planbot/shared/tool-schemas";
import type { Env, ToolDefinition } from "../types";
import { searchIssues } from "../jira";
import { loadTeamCapacity } from "../capacity";
import { searchPages } from "../confluence";
import { generatePlan, type PlannerInput } from "../planner";
import { getAtlassianAccessToken } from "../api/atlassian-oauth";

export const tools: ToolDefinition[] = [
  createToolDefinition(
    "generate_plan",
    "Generate a delivery plan by fetching issues, team capacity, and context, then running the AI planner",
    parametersSchema(
      {
        issues_jql: stringProp({ description: "JQL query to fetch issues for the plan" }),
        team: stringProp({ description: "Team name for capacity lookup (defaults to 'default')" }),
        from: stringProp({ description: "Planning horizon start date (ISO string, e.g. 2025-01-01)" }),
        to: stringProp({ description: "Planning horizon end date (ISO string, e.g. 2025-03-31)" }),
        title: stringProp({ description: "Title for the generated plan" }),
      },
      ["issues_jql"],
    ),
  ),
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env,
  userId?: string,
): Promise<unknown> {
  switch (name) {
    case "generate_plan": {
      if (!userId) {
        throw new Error("Atlassian account not connected. Please visit /api/auth/atlassian/connect");
      }
      const auth = await getAtlassianAccessToken(userId, env);

      const jql = args.issues_jql as string;
      const teamName = (args.team as string) ?? "default";
      const today = new Date().toISOString().slice(0, 10);
      const from = (args.from as string) ?? today;
      const to =
        (args.to as string) ??
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const title = (args.title as string) ?? "Delivery Plan";

      const [issues, capacity, confluenceContext] = await Promise.all([
        searchIssues(jql, env, auth),
        loadTeamCapacity(teamName, env),
        searchPages(`label = "planning" AND type = page`, env, auth).catch(() => []),
      ]);

      const input: PlannerInput = {
        issues,
        capacity,
        horizon: { from, to },
        confluenceContext,
        title,
      };

      return generatePlan(input, env.OPENAI_API_KEY);
    }
    default:
      throw new Error(`Unknown planner tool: ${name}`);
  }
}
