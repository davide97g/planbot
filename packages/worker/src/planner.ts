import { z } from "zod";
import type { ConfluencePage, JiraIssue, PlanningResult, TeamCapacity } from "./types";

const MAX_CONTEXT_CHARS = 4000;

export interface PlannerInput {
  issues: JiraIssue[];
  capacity: TeamCapacity;
  horizon: { from: string; to: string };
  confluenceContext: ConfluencePage[];
  title: string;
}

const PlannedTaskSchema = z.object({
  key: z.string(),
  summary: z.string(),
  stream: z.string(),
  owner: z.string(),
  start_date: z.string(),
  due_date: z.string(),
  bdg: z.number(),
  act: z.number(),
  etc: z.number(),
  eac: z.number(),
  diff: z.number(),
  status: z.enum(["on_track", "at_risk", "blocked", "completed"]),
  dependencies: z.array(z.string()),
});

const RiskSchema = z.object({
  type: z.enum(["blocker", "overload", "dependency", "timeline", "scope"]),
  severity: z.enum(["high", "medium", "low"]),
  description: z.string(),
  affected_tasks: z.array(z.string()),
  mitigation: z.string(),
});

const PlanningResultSchema = z.object({
  title: z.string(),
  generated_at: z.string(),
  horizon: z.object({ from: z.string(), to: z.string() }),
  tasks: z.array(PlannedTaskSchema),
  risks: z.array(RiskSchema),
  summary: z.object({
    total_tasks: z.number(),
    team_size: z.number(),
    at_risk_count: z.number(),
    blocked_count: z.number(),
    completion_confidence: z.number(),
  }),
});

export function buildPrompt(input: PlannerInput): { system: string; user: string } {
  const confluenceText = input.confluenceContext
    .map((p) => `## ${p.title}\n${p.bodyText}`)
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);

  const system = `You are a project planning assistant. Analyze the provided Jira issues, team capacity, and context to generate a detailed delivery plan.

Output a JSON object matching this exact schema:
- title: string
- generated_at: ISO date string
- horizon: { from: string, to: string }
- tasks: array of { key, summary, stream, owner, start_date, due_date, bdg, act, etc, eac, diff, status, dependencies }
  - status must be one of: "on_track", "at_risk", "blocked", "completed"
  - bdg = budget (story points), act = actual spent, etc = estimate to complete, eac = estimate at completion, diff = bdg - eac
- risks: array of { type, severity, description, affected_tasks, mitigation }
  - type must be one of: "blocker", "overload", "dependency", "timeline", "scope"
  - severity must be one of: "high", "medium", "low"
- summary: { total_tasks, team_size, at_risk_count, blocked_count, completion_confidence (0-100) }

Consider dependencies between tasks, team member skills and capacity, and identify risks proactively. Assign realistic start/due dates within the planning horizon.`;

  const issuesSummary = input.issues.map((i) => ({
    key: i.key,
    summary: i.summary,
    assignee: i.assignee,
    storyPoints: i.storyPoints,
    status: i.status,
    issueType: i.issueType,
    priority: i.priority,
    dependencies: i.dependencies,
    labels: i.labels,
  }));

  const user = `Planning horizon: ${input.horizon.from} to ${input.horizon.to}
Title: ${input.title}

Team capacity:
${JSON.stringify(input.capacity, null, 2)}

Jira issues (${input.issues.length}):
${JSON.stringify(issuesSummary, null, 2)}

${confluenceText ? `Additional context from Confluence:\n${confluenceText}` : ""}

Generate the delivery plan as JSON.`;

  return { system, user };
}

const JSON_SCHEMA = {
  name: "planning_result",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      generated_at: { type: "string" },
      horizon: {
        type: "object",
        properties: { from: { type: "string" }, to: { type: "string" } },
        required: ["from", "to"],
        additionalProperties: false,
      },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            summary: { type: "string" },
            stream: { type: "string" },
            owner: { type: "string" },
            start_date: { type: "string" },
            due_date: { type: "string" },
            bdg: { type: "number" },
            act: { type: "number" },
            etc: { type: "number" },
            eac: { type: "number" },
            diff: { type: "number" },
            status: { type: "string", enum: ["on_track", "at_risk", "blocked", "completed"] },
            dependencies: { type: "array", items: { type: "string" } },
          },
          required: [
            "key", "summary", "stream", "owner", "start_date", "due_date",
            "bdg", "act", "etc", "eac", "diff", "status", "dependencies",
          ],
          additionalProperties: false,
        },
      },
      risks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["blocker", "overload", "dependency", "timeline", "scope"] },
            severity: { type: "string", enum: ["high", "medium", "low"] },
            description: { type: "string" },
            affected_tasks: { type: "array", items: { type: "string" } },
            mitigation: { type: "string" },
          },
          required: ["type", "severity", "description", "affected_tasks", "mitigation"],
          additionalProperties: false,
        },
      },
      summary: {
        type: "object",
        properties: {
          total_tasks: { type: "number" },
          team_size: { type: "number" },
          at_risk_count: { type: "number" },
          blocked_count: { type: "number" },
          completion_confidence: { type: "number" },
        },
        required: ["total_tasks", "team_size", "at_risk_count", "blocked_count", "completion_confidence"],
        additionalProperties: false,
      },
    },
    required: ["title", "generated_at", "horizon", "tasks", "risks", "summary"],
    additionalProperties: false,
  },
};

export async function generatePlan(input: PlannerInput, apiKey: string): Promise<PlanningResult> {
  const { system, user } = buildPrompt(input);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: JSON_SCHEMA },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };

  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty response");
  }

  return PlanningResultSchema.parse(JSON.parse(content));
}
