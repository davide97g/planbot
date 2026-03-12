import type { ConfluencePage, Env } from "./types";

function authHeader(env: Env): string {
  return "Basic " + btoa(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

interface ConfluenceSearchResponse {
  results: {
    id: string;
    title: string;
    body?: { storage?: { value: string } };
    metadata?: { labels?: { results?: { name: string }[] } };
  }[];
}

export async function searchPages(cql: string, env: Env): Promise<ConfluencePage[]> {
  try {
    const url = new URL(`${env.CONFLUENCE_BASE_URL}/wiki/rest/api/content`);
    url.searchParams.set("cql", cql);
    url.searchParams.set("expand", "body.storage,metadata.labels");
    url.searchParams.set("limit", "10");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader(env),
        Accept: "application/json",
      },
    });

    if (!res.ok) return [];

    const data: ConfluenceSearchResponse = await res.json();

    return data.results.map((r) => ({
      id: r.id,
      title: r.title,
      bodyText: stripHtml(r.body?.storage?.value ?? ""),
      labels: (r.metadata?.labels?.results ?? []).map((l) => l.name),
    }));
  } catch {
    return [];
  }
}

export async function getPageById(pageId: string, env: Env): Promise<ConfluencePage | null> {
  try {
    const url = new URL(`${env.CONFLUENCE_BASE_URL}/wiki/rest/api/content/${pageId}`);
    url.searchParams.set("expand", "body.storage,metadata.labels");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader(env),
        Accept: "application/json",
      },
    });

    if (!res.ok) return null;

    const r = await res.json() as ConfluenceSearchResponse["results"][0];

    return {
      id: r.id,
      title: r.title,
      bodyText: stripHtml(r.body?.storage?.value ?? ""),
      labels: (r.metadata?.labels?.results ?? []).map((l) => l.name),
    };
  } catch {
    return null;
  }
}

/**
 * Extract a Confluence page ID from a URL like:
 * https://domain.atlassian.net/wiki/spaces/SPACE/pages/12345/Page+Title
 */
export function extractPageIdFromUrl(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/);
  return match ? match[1] : null;
}
