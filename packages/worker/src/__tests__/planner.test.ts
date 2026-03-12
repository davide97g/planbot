import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPrompt, generatePlan, type PlannerInput } from "../planner";

const makePlannerInput = (): PlannerInput => ({
  issues: [
    {
      key: "PROJ-1",
      summary: "Implement login",
      assignee: "Alice",
      storyPoints: 5,
      status: "To Do",
      issueType: "Story",
      priority: "High",
      fixVersions: ["1.0"],
      sprint: "Sprint 1",
      dependencies: ["PROJ-2"],
      labels: ["auth"],
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-02T00:00:00.000Z",
    },
  ],
  capacity: {
    team_name: "backend",
    members: [{ name: "Alice", capacity_hours_per_day: 6, skills: ["typescript"] }],
    holidays: [],
    sprint_length_days: 10,
  },
  horizon: { from: "2024-01-01", to: "2024-01-14" },
  confluenceContext: [
    { id: "1", title: "Auth Spec", bodyText: "Login must use OAuth2", labels: ["spec"] },
  ],
  title: "Release Plan: 1.0",
});

describe("buildPrompt", () => {
  it("includes all data in prompts", () => {
    const input = makePlannerInput();
    const { system, user } = buildPrompt(input);

    expect(system).toContain("project planning assistant");
    expect(system).toContain("JSON");
    expect(user).toContain("2024-01-01");
    expect(user).toContain("2024-01-14");
    expect(user).toContain("PROJ-1");
    expect(user).toContain("Implement login");
    expect(user).toContain("Alice");
    expect(user).toContain("Auth Spec");
    expect(user).toContain("Login must use OAuth2");
  });

  it("handles empty confluence context", () => {
    const input = makePlannerInput();
    input.confluenceContext = [];
    const { user } = buildPrompt(input);
    expect(user).not.toContain("Additional context from Confluence");
  });
});

describe("generatePlan", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("calls OpenAI and validates response", async () => {
    const mockResult = {
      title: "Release Plan: 1.0",
      generated_at: "2024-01-01T00:00:00.000Z",
      horizon: { from: "2024-01-01", to: "2024-01-14" },
      tasks: [
        {
          key: "PROJ-1",
          summary: "Implement login",
          stream: "Auth",
          owner: "Alice",
          start_date: "2024-01-01",
          due_date: "2024-01-05",
          bdg: 5,
          act: 0,
          etc: 5,
          eac: 5,
          diff: 0,
          status: "on_track",
          dependencies: ["PROJ-2"],
        },
      ],
      risks: [
        {
          type: "dependency",
          severity: "medium",
          description: "PROJ-2 blocks PROJ-1",
          affected_tasks: ["PROJ-1"],
          mitigation: "Prioritize PROJ-2",
        },
      ],
      summary: {
        total_tasks: 1,
        team_size: 1,
        at_risk_count: 0,
        blocked_count: 0,
        completion_confidence: 85,
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResult) } }],
        }),
      }),
    );

    const result = await generatePlan(makePlannerInput(), "sk-test");
    expect(result.title).toBe("Release Plan: 1.0");
    expect(result.tasks).toHaveLength(1);
    expect(result.risks).toHaveLength(1);
    expect(result.summary.completion_confidence).toBe(85);
  });

  it("throws on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      }),
    );

    await expect(generatePlan(makePlannerInput(), "sk-test")).rejects.toThrow("OpenAI API error: 429");
  });
});
