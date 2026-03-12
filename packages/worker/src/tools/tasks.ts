import {
  createToolDefinition,
  parametersSchema,
  stringProp,
} from "@planbot/shared/tool-schemas";
import type { ToolDefinition } from "../types";

export const tools: ToolDefinition[] = [
  createToolDefinition(
    "create_task",
    "Create a task/todo item in the user's task sidebar. Use this when the user asks you to create tasks, action items, or when generating plans with actionable steps. Each call creates one task.",
    parametersSchema(
      {
        title: stringProp({
          description: "Short task title describing the action item",
        }),
      },
      ["title"],
    ),
  ),
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "create_task": {
      const title = args.title as string;
      return {
        success: true,
        title,
        message: `Task "${title}" created in the user's task sidebar`,
      };
    }
    default:
      throw new Error(`Unknown task tool: ${name}`);
  }
}
