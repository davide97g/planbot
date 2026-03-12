import { describe, it, expect, vi, beforeEach } from "vitest";
import { stripHtml, searchPages } from "../confluence";

const mockEnv = {
  CONFLUENCE_BASE_URL: "https://test.atlassian.net",
  JIRA_EMAIL: "test@test.com",
  JIRA_API_TOKEN: "token123",
} as any;

const mockAuth = {
  accessToken: "test-access-token",
  cloudId: "test-cloud-id",
};

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("decodes HTML entities", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot; &nbsp;")).toBe('& < > "');
  });

  it("collapses whitespace", () => {
    expect(stripHtml("<p>hello</p>  \n  <p>world</p>")).toBe("hello world");
  });

  it("handles empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("searchPages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed Confluence pages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              id: "123",
              title: "Test Page",
              body: { storage: { value: "<p>Content here</p>" } },
              metadata: { labels: { results: [{ name: "planning" }] } },
            },
          ],
        }),
      }),
    );

    const pages = await searchPages('label = "planning"', mockEnv, mockAuth);
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe("Test Page");
    expect(pages[0].bodyText).toBe("Content here");
    expect(pages[0].labels).toEqual(["planning"]);
  });

  it("returns empty array on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const pages = await searchPages("label = test", mockEnv, mockAuth);
    expect(pages).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const pages = await searchPages("label = test", mockEnv, mockAuth);
    expect(pages).toEqual([]);
  });

  it("handles missing body and labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ id: "1", title: "Minimal" }],
        }),
      }),
    );

    const pages = await searchPages("title = test", mockEnv, mockAuth);
    expect(pages[0].bodyText).toBe("");
    expect(pages[0].labels).toEqual([]);
  });
});
