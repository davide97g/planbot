import {
  createToolDefinition,
  parametersSchema,
  stringProp,
} from "@planbot/shared/tool-schemas";
import type { Env, ToolDefinition } from "../types";
import { loadTeamCapacity } from "../capacity";

export const tools: ToolDefinition[] = [
  createToolDefinition(
    "get_team_capacity",
    "Load capacity configuration for a team",
    parametersSchema({ team: stringProp({ description: "Team name" }) }, ["team"]),
  ),
  createToolDefinition(
    "list_teams",
    "List all configured team names",
    parametersSchema({}),
  ),
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env,
): Promise<unknown> {
  switch (name) {
    case "get_team_capacity":
      return loadTeamCapacity(args.team as string, env);
    case "list_teams": {
      const keys = await env.PLANBOT_CONFIG.list({ prefix: "team:" });
      return keys.keys.map((k) => k.name.replace(/^team:/, ""));
    }
    default:
      throw new Error(`Unknown capacity tool: ${name}`);
  }
}
