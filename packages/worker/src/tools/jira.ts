import {
  createToolDefinition,
  parametersSchema,
  stringProp,
  integerProp,
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
  createToolDefinition(
    "get_sprint_details",
    "Get details about a specific sprint or the active sprint — name, dates, state, and board info. Use for sprint reviews and analysis.",
    parametersSchema({
      sprint_name: stringProp({
        description: "Sprint name to look up. Leave empty to get the active sprint.",
      }),
    }),
  ),
  createToolDefinition(
    "get_sprint_velocity",
    "Get velocity data for a sprint — committed vs completed story points. Also returns historical velocity if available.",
    parametersSchema({
      sprint_name: stringProp({
        description: "Sprint name to analyze. Leave empty for the active sprint.",
      }),
      board_id: integerProp({
        description: "Jira board ID (optional — auto-detected if not specified)",
      }),
    }),
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

    case "get_sprint_details": {
      const sprintName = args.sprint_name as string | undefined;
      return getSprintDetails(sprintName, auth);
    }

    case "get_sprint_velocity": {
      const sprintName = args.sprint_name as string | undefined;
      const boardId = args.board_id as number | undefined;
      return getSprintVelocity(sprintName, boardId, auth, env);
    }

    default:
      throw new Error(`Unknown jira tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Sprint detail/velocity helpers (Jira Agile API)
// ---------------------------------------------------------------------------

interface SprintDetail {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  boardId: number;
  boardName: string;
}

async function getSprintDetails(
  sprintName: string | undefined,
  auth: { accessToken: string; cloudId: string },
): Promise<SprintDetail | SprintDetail[]> {
  // Get boards
  const boardRes = await fetch(
    `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/agile/1.0/board?maxResults=10`,
    { headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } },
  );
  if (!boardRes.ok) throw new Error(`Failed to fetch boards: ${boardRes.status}`);
  const boardData = (await boardRes.json()) as { values: { id: number; name: string }[] };

  const results: SprintDetail[] = [];

  for (const board of boardData.values.slice(0, 5)) {
    const state = sprintName ? "active,closed" : "active";
    const sprintRes = await fetch(
      `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/agile/1.0/board/${board.id}/sprint?state=${state}&maxResults=10`,
      { headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } },
    );
    if (!sprintRes.ok) continue;

    const sprintData = (await sprintRes.json()) as {
      values: {
        id: number;
        name: string;
        state: string;
        startDate?: string;
        endDate?: string;
        completeDate?: string;
      }[];
    };

    for (const s of sprintData.values) {
      if (sprintName && !s.name.toLowerCase().includes(sprintName.toLowerCase())) continue;

      results.push({
        id: s.id,
        name: s.name,
        state: s.state,
        startDate: s.startDate,
        endDate: s.endDate,
        completeDate: s.completeDate,
        boardId: board.id,
        boardName: board.name,
      });
    }
  }

  if (results.length === 1) return results[0];
  return results;
}

async function getSprintVelocity(
  sprintName: string | undefined,
  boardId: number | undefined,
  auth: { accessToken: string; cloudId: string },
  env: Env,
): Promise<unknown> {
  // Determine which sprint to analyze
  let jql: string;
  if (sprintName) {
    jql = `sprint = "${sprintName}"`;
  } else {
    jql = `sprint in openSprints()`;
  }

  const issues = await searchIssues(jql, env, auth);

  const totalIssues = issues.length;
  const done = issues.filter((i) => i.status === "Done" || i.status === "Closed");
  const committed = issues.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
  const completed = done.reduce((s, i) => s + (i.storyPoints ?? 0), 0);
  const completionRate = totalIssues > 0 ? Math.round((done.length / totalIssues) * 100) : 0;

  // Group by status
  const byStatus: Record<string, number> = {};
  for (const i of issues) {
    byStatus[i.status] = (byStatus[i.status] ?? 0) + 1;
  }

  // Group by type
  const byType: Record<string, number> = {};
  for (const i of issues) {
    byType[i.issueType] = (byType[i.issueType] ?? 0) + 1;
  }

  // Get historical velocity
  const bid = boardId ?? 0;
  const historyRaw = await env.PLANBOT_CONFIG.get(`sprint:${bid}:velocity`);
  const history = historyRaw ? JSON.parse(historyRaw) : [];

  return {
    sprint: sprintName ?? "Active Sprint",
    totalIssues,
    completedIssues: done.length,
    committedPoints: committed,
    completedPoints: completed,
    completionRate,
    carryoverIssues: totalIssues - done.length,
    byStatus,
    byType,
    velocityHistory: history,
  };
}
