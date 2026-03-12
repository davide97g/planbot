import type { Env, ToolCall, ToolDefinition, ToolResult } from "../types";

import { tools as jiraTools, executeTool as executeJiraTool } from "./jira";
import { tools as confluenceTools, executeTool as executeConfluenceTool } from "./confluence";
import { tools as capacityTools, executeTool as executeCapacityTool } from "./capacity";
import { tools as plannerTools, executeTool as executePlannerTool } from "./planner";
import { tools as excelTools, executeTool as executeExcelTool } from "./excel";

// ---------------------------------------------------------------------------
// All tool definitions — flat list for LLM function-calling schemas
// ---------------------------------------------------------------------------

export const allToolDefinitions: ToolDefinition[] = [
  ...jiraTools,
  ...confluenceTools,
  ...capacityTools,
  ...plannerTools,
  ...excelTools,
];

// ---------------------------------------------------------------------------
// Tool name → module lookup
// ---------------------------------------------------------------------------

const jiraToolNames = new Set(jiraTools.map((t) => t.name));
const confluenceToolNames = new Set(confluenceTools.map((t) => t.name));
const capacityToolNames = new Set(capacityTools.map((t) => t.name));
const plannerToolNames = new Set(plannerTools.map((t) => t.name));
const excelToolNames = new Set(excelTools.map((t) => t.name));

// ---------------------------------------------------------------------------
// executeToolCall — routes a ToolCall to the right module
// ---------------------------------------------------------------------------

export async function executeToolCall(
  toolCall: ToolCall,
  env: Env,
  userId?: string,
): Promise<ToolResult> {
  const { id, name, arguments: args } = toolCall;

  try {
    let result: unknown;

    if (jiraToolNames.has(name)) {
      result = await executeJiraTool(name, args, env, userId);
    } else if (confluenceToolNames.has(name)) {
      result = await executeConfluenceTool(name, args, env, userId);
    } else if (capacityToolNames.has(name)) {
      result = await executeCapacityTool(name, args, env);
    } else if (plannerToolNames.has(name)) {
      result = await executePlannerTool(name, args, env);
    } else if (excelToolNames.has(name)) {
      result = await executeExcelTool(name, args, env);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return { toolCallId: id, name, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { toolCallId: id, name, result: { error: message }, isError: true };
  }
}
