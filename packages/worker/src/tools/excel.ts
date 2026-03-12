import {
  createToolDefinition,
  parametersSchema,
  objectProp,
} from "@planbot/shared/tool-schemas";
import type { Env, PlanningResult, ToolDefinition } from "../types";
import { generateExcel } from "../excel";

export const tools: ToolDefinition[] = [
  createToolDefinition(
    "generate_excel_report",
    "Generate an Excel report from a planning result and return it as base64",
    parametersSchema(
      {
        plan: objectProp({}, { description: "PlanningResult object to convert to Excel" }),
      },
      ["plan"],
    ),
  ),
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  _env: Env,
): Promise<unknown> {
  switch (name) {
    case "generate_excel_report": {
      const plan = args.plan as PlanningResult;
      const buffer = generateExcel(plan);
      const bytes = new Uint8Array(buffer);
      // Convert to base64
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return { base64: btoa(binary), mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
    }
    default:
      throw new Error(`Unknown excel tool: ${name}`);
  }
}
