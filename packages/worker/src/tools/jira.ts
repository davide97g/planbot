import {
  createToolDefinition,
  parametersSchema,
  stringProp,
} from "@planbot/shared/tool-schemas";
import type { Env, ToolDefinition } from "../types";
import { searchIssues, issuesByFixVersion, issuesByActiveSprint } from "../jira";
import { getAtlassianAccessToken } from "../api/atlassian-oauth";

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
  userId?: string,
): Promise<unknown> {
  // Resolve OAuth token (throws if not connected)
  if (!userId) {
    throw new Error("Atlassian account not connected. Please visit /api/auth/atlassian/connect");
  }
  const auth = await getAtlassianAccessToken(userId, env);

  switch (name) {
    case "search_jira_issues":
      return searchIssues(args.jql as string, env, auth);
    case "get_issue": {
      const issues = await searchIssues(`key = "${args.key as string}"`, env, auth);
      return issues[0] ?? null;
    }
    case "search_by_version":
      return issuesByFixVersion(args.version as string, env, auth);
    case "get_active_sprint":
      return issuesByActiveSprint(env, auth);
    default:
      throw new Error(`Unknown jira tool: ${name}`);
  }
}
