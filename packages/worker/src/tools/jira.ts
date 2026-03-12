import {
  createToolDefinition,
  parametersSchema,
  stringProp,
} from "@planbot/shared/tool-schemas";
import type { Env, ToolDefinition } from "../types";
import { searchIssues, issuesByFixVersion, issuesByActiveSprint } from "../jira";

export const tools: ToolDefinition[] = [
  createToolDefinition(
    "search_jira_issues",
    "Search Jira issues using a JQL query",
    parametersSchema({ jql: stringProp({ description: "JQL query string" }) }, ["jql"]),
  ),
  createToolDefinition(
    "get_issue",
    "Get a single Jira issue by its key",
    parametersSchema({ key: stringProp({ description: "Jira issue key, e.g. PROJ-123" }) }, ["key"]),
  ),
  createToolDefinition(
    "search_by_version",
    "Search Jira issues by fix version",
    parametersSchema({ version: stringProp({ description: "Fix version name" }) }, ["version"]),
  ),
  createToolDefinition(
    "get_active_sprint",
    "Get all issues in the currently active sprint",
    parametersSchema({}),
  ),
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env,
): Promise<unknown> {
  switch (name) {
    case "search_jira_issues":
      return searchIssues(args.jql as string, env);
    case "get_issue": {
      const issues = await searchIssues(`key = "${args.key as string}"`, env);
      return issues[0] ?? null;
    }
    case "search_by_version":
      return issuesByFixVersion(args.version as string, env);
    case "get_active_sprint":
      return issuesByActiveSprint(env);
    default:
      throw new Error(`Unknown jira tool: ${name}`);
  }
}
