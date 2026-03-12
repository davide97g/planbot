import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapIssue, searchIssues } from "../jira";

const mockEnv = {
  JIRA_BASE_URL: "https://test.atlassian.net",
  JIRA_EMAIL: "test@test.com",
  JIRA_API_TOKEN: "token123",
} as any;

const mockAuth = {
  accessToken: "test-access-token",
  cloudId: "test-cloud-id",
};

describe("mapIssue", () => {
  it("transforms raw Jira issue to JiraIssue interface", () => {
    const raw = {
      key: "PROJ-1",
      fields: {
        summary: "Test issue",
        assignee: { displayName: "Alice" },
        customfield_10016: 5,
        status: { name: "In Progress" },
        issuetype: { name: "Story" },
        priority: { name: "High" },
        fixVersions: [{ name: "1.0" }],
        sprint: { name: "Sprint 1" },
        issuelinks: [
          {
            type: { name: "Blocks" },
            outwardIssue: { key: "PROJ-2" },
          },
        ],
        labels: ["backend"],
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-02T00:00:00.000Z",
      },
    };

    const result = mapIssue(raw);

    expect(result).toEqual({
      key: "PROJ-1",
      summary: "Test issue",
      assignee: "Alice",
      storyPoints: 5,
      status: "In Progress",
      issueType: "Story",
      priority: "High",
      fixVersions: ["1.0"],
      sprint: "Sprint 1",
      dependencies: ["PROJ-2"],
      labels: ["backend"],
      created: "2024-01-01T00:00:00.000Z",
      updated: "2024-01-02T00:00:00.000Z",
    });
  });

  it("handles null assignee and missing fields", () => {
    const raw = {
      key: "PROJ-2",
      fields: {
        summary: "No assignee",
        assignee: null,
        customfield_10016: null,
        status: { name: "To Do" },
        issuetype: { name: "Bug" },
        priority: { name: "Low" },
        fixVersions: [],
        sprint: null,
        issuelinks: [],
        labels: [],
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      },
    };

    const result = mapIssue(raw);
    expect(result.assignee).toBeNull();
    expect(result.storyPoints).toBeNull();
    expect(result.sprint).toBeNull();
    expect(result.dependencies).toEqual([]);
  });

  it("extracts both inward and outward Blocks dependencies", () => {
    const raw = {
      key: "PROJ-3",
      fields: {
        summary: "With deps",
        assignee: null,
        customfield_10016: null,
        status: { name: "To Do" },
        issuetype: { name: "Task" },
        priority: { name: "Medium" },
        issuelinks: [
          { type: { name: "Blocks" }, outwardIssue: { key: "PROJ-4" } },
          { type: { name: "Blocks" }, inwardIssue: { key: "PROJ-5" } },
          { type: { name: "Relates" }, outwardIssue: { key: "PROJ-6" } },
        ],
        labels: [],
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      },
    };

    const result = mapIssue(raw);
    expect(result.dependencies).toEqual(["PROJ-4", "PROJ-5"]);
  });
});

describe("searchIssues", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends correct auth header and JQL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        startAt: 0,
        maxResults: 100,
        total: 1,
        isLast: true,
        issues: [
          {
            key: "PROJ-1",
            fields: {
              summary: "Test",
              assignee: null,
              customfield_10016: null,
              status: { name: "To Do" },
              issuetype: { name: "Task" },
              priority: { name: "Medium" },
              issuelinks: [],
              labels: [],
              created: "2024-01-01T00:00:00.000Z",
              updated: "2024-01-01T00:00:00.000Z",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await searchIssues("project = PROJ", mockEnv, mockAuth);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("PROJ-1");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("test-cloud-id");
    expect(url).toContain("rest/api/3/search/jql");
    expect(opts.headers.Authorization).toMatch(/^Bearer /);
  });

  it("paginates through results", async () => {
    const makeIssue = (key: string) => ({
      key,
      fields: {
        summary: key,
        assignee: null,
        customfield_10016: null,
        status: { name: "To Do" },
        issuetype: { name: "Task" },
        priority: { name: "Medium" },
        issuelinks: [],
        labels: [],
        created: "2024-01-01T00:00:00.000Z",
        updated: "2024-01-01T00:00:00.000Z",
      },
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isLast: false,
          nextPageToken: "cursor-page-2",
          issues: Array.from({ length: 100 }, (_, i) => makeIssue(`P-${i}`)),
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isLast: true,
          issues: Array.from({ length: 50 }, (_, i) => makeIssue(`P-${100 + i}`)),
        }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const result = await searchIssues("project = BIG", mockEnv, mockAuth);
    expect(result).toHaveLength(150);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
