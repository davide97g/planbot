import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatPlanBlocks, postToResponseUrl, uploadFile } from "../slack";
import type { PlanningResult } from "../types";

const makeResult = (taskCount = 5, riskCount = 2): PlanningResult => ({
  title: "Test Plan",
  generated_at: "2024-01-01T00:00:00.000Z",
  horizon: { from: "2024-01-01", to: "2024-01-14" },
  tasks: Array.from({ length: taskCount }, (_, i) => ({
    key: `T-${i}`,
    summary: `Task ${i}`,
    stream: "Backend",
    owner: "Alice",
    start_date: "2024-01-01",
    due_date: "2024-01-05",
    bdg: 5,
    act: 0,
    etc: 5,
    eac: 5,
    diff: 0,
    status: "on_track" as const,
    dependencies: [],
  })),
  risks: Array.from({ length: riskCount }, (_, i) => ({
    type: "timeline" as const,
    severity: "medium" as const,
    description: `Risk ${i}`,
    affected_tasks: [`T-${i}`],
    mitigation: `Mitigate ${i}`,
  })),
  summary: {
    total_tasks: taskCount,
    team_size: 2,
    at_risk_count: 0,
    blocked_count: 0,
    completion_confidence: 80,
  },
});

describe("formatPlanBlocks", () => {
  it("produces valid block structure", () => {
    const blocks = formatPlanBlocks(makeResult());
    expect(blocks[0].type).toBe("header");
    expect(blocks[1].type).toBe("section");
    expect(blocks[1].fields).toBeDefined();
    expect(blocks.length).toBeGreaterThan(3);
  });

  it("caps at 50 blocks", () => {
    const blocks = formatPlanBlocks(makeResult(60, 20));
    expect(blocks.length).toBeLessThanOrEqual(50);
  });

  it("includes status emojis", () => {
    const result = makeResult(1, 0);
    result.tasks[0].status = "at_risk";
    const blocks = formatPlanBlocks(result);
    const taskBlock = blocks.find((b) => b.text?.text?.includes("T-0"));
    expect(taskBlock?.text?.text).toContain(":warning:");
  });

  it("shows overflow message when tasks exceed limit", () => {
    const blocks = formatPlanBlocks(makeResult(25, 0));
    const contextBlock = blocks.find((b) => b.type === "context");
    expect(contextBlock).toBeDefined();
    expect(contextBlock?.elements?.[0].text).toContain("5 more tasks");
  });
});

describe("postToResponseUrl", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends correct payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    await postToResponseUrl("https://hooks.slack.com/test", [{ type: "section", text: { type: "mrkdwn", text: "hi" } }], "fallback");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/test");
    const body = JSON.parse(opts.body);
    expect(body.response_type).toBe("in_channel");
    expect(body.blocks).toHaveLength(1);
  });
});

describe("uploadFile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("follows three-step upload flow", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, upload_url: "https://upload.slack.com/put", file_id: "F123" }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });
    vi.stubGlobal("fetch", mockFetch);

    await uploadFile("C123", "test.xlsx", new ArrayBuffer(100), "xoxb-test");

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toContain("getUploadURLExternal");
    expect(mockFetch.mock.calls[1][0]).toBe("https://upload.slack.com/put");
    expect(mockFetch.mock.calls[2][0]).toContain("completeUploadExternal");
  });
});
