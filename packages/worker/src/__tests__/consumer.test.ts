import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleQueue } from "../consumer";
import type { PlanningJob, PlanningResult } from "../types";

// Mock all dependencies
vi.mock("../jira", () => ({
  issuesByFixVersion: vi.fn(),
  issuesByActiveSprint: vi.fn(),
  searchIssues: vi.fn(),
}));

vi.mock("../confluence", () => ({
  searchPages: vi.fn().mockResolvedValue([]),
}));

vi.mock("../capacity", () => ({
  loadTeamCapacity: vi.fn().mockResolvedValue({
    team_name: "default",
    members: [{ name: "Alice", capacity_hours_per_day: 6, skills: [] }],
    holidays: [],
    sprint_length_days: 10,
  }),
  totalCapacityHours: vi.fn().mockReturnValue(60),
}));

vi.mock("../planner", () => ({
  generatePlan: vi.fn(),
}));

vi.mock("../slack", () => ({
  formatPlanBlocks: vi.fn().mockReturnValue([{ type: "section", text: { type: "mrkdwn", text: "plan" } }]),
  postToResponseUrl: vi.fn().mockResolvedValue(undefined),
  uploadFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../excel", () => ({
  generateExcel: vi.fn().mockReturnValue(new ArrayBuffer(100)),
}));

const { issuesByFixVersion } = await import("../jira");
const { generatePlan } = await import("../planner");
const { postToResponseUrl } = await import("../slack");

const makeJob = (overrides?: Partial<PlanningJob>): PlanningJob => ({
  command: "release",
  args: "1.0",
  flags: {},
  response_url: "https://hooks.slack.com/response",
  channel_id: "C123",
  user_id: "U123",
  team_config_name: "default",
  ...overrides,
});

const mockEnv = {
  OPENAI_API_KEY: "sk-test",
  SLACK_BOT_TOKEN: "xoxb-test",
  PLANBOT_CONFIG: { get: vi.fn().mockResolvedValue(null) },
} as any;

describe("handleQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes a release job end-to-end", async () => {
    const mockIssue = {
      key: "P-1",
      summary: "Test",
      assignee: "Alice",
      storyPoints: 3,
      status: "To Do",
      issueType: "Story",
      priority: "Medium",
      fixVersions: ["1.0"],
      sprint: null,
      dependencies: [],
      labels: [],
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-01T00:00:00.000Z",
    };

    const mockResult: PlanningResult = {
      title: "Release Plan: 1.0",
      generated_at: "2024-01-01T00:00:00.000Z",
      horizon: { from: "2024-01-01", to: "2024-01-14" },
      tasks: [],
      risks: [],
      summary: { total_tasks: 0, team_size: 1, at_risk_count: 0, blocked_count: 0, completion_confidence: 90 },
    };

    vi.mocked(issuesByFixVersion).mockResolvedValue([mockIssue]);
    vi.mocked(generatePlan).mockResolvedValue(mockResult);

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      messages: [{ body: makeJob(), ack, retry }],
    } as any;

    await handleQueue(batch, mockEnv);

    expect(issuesByFixVersion).toHaveBeenCalledWith("1.0", mockEnv);
    expect(generatePlan).toHaveBeenCalled();
    expect(ack).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it("posts error and returns on zero issues", async () => {
    vi.mocked(issuesByFixVersion).mockResolvedValue([]);

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      messages: [{ body: makeJob(), ack, retry }],
    } as any;

    await handleQueue(batch, mockEnv);

    expect(postToResponseUrl).toHaveBeenCalledWith(
      "https://hooks.slack.com/response",
      [],
      expect.stringContaining("No issues found"),
    );
    expect(ack).toHaveBeenCalled();
  });

  it("retries on error", async () => {
    vi.mocked(issuesByFixVersion).mockRejectedValue(new Error("Jira down"));

    const ack = vi.fn();
    const retry = vi.fn();
    const batch = {
      messages: [{ body: makeJob(), ack, retry }],
    } as any;

    await handleQueue(batch, mockEnv);

    expect(retry).toHaveBeenCalled();
    expect(ack).not.toHaveBeenCalled();
  });
});
