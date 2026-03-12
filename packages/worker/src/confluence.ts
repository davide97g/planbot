import type { ConfluencePage, Env } from "./types";

type AtlassianAuth = { accessToken: string; cloudId: string };

function authHeader(token: string): string {
  return `Bearer ${token}`;
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

// ---------------------------------------------------------------------------
// V2 API types
// ---------------------------------------------------------------------------

interface ConfluenceV2PageResponse {
  results: ConfluenceV2Page[];
  _links?: { base?: string; next?: string };
}

interface ConfluenceV2Page {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  body?: { storage?: { value: string } };
  _links?: { webui?: string; base?: string };
}

// ---------------------------------------------------------------------------
// Search pages using V2 API (works with read:page:confluence scope)
// ---------------------------------------------------------------------------

export async function searchPages(
  _cql: string,
  env: Env,
  auth: AtlassianAuth,
  titleQuery?: string,
): Promise<ConfluencePage[]> {
  const search = titleQuery ?? extractTitleFromCql(_cql);

  try {
    // 1) Try exact title match first (fast, precise)
    if (search) {
      const exact = await fetchPagesV2(auth, { title: search, bodyFormat: "storage" });
      if (exact.length > 0) return exact;
    }

    // 2) Fetch a batch of recent pages and filter client-side by substring
    const all = await fetchPagesV2(auth, { limit: 50, bodyFormat: "storage" });
    if (!search) return all.slice(0, 10);

    const q = search.toLowerCase();
    return all
      .filter((p) => p.title.toLowerCase().includes(q))
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchPagesV2(
  auth: AtlassianAuth,
  opts: { title?: string; limit?: number; bodyFormat?: string },
): Promise<ConfluencePage[]> {
  const url = new URL(`https://api.atlassian.com/ex/confluence/${auth.cloudId}/wiki/api/v2/pages`);
  url.searchParams.set("limit", String(opts.limit ?? 10));
  if (opts.bodyFormat) url.searchParams.set("body-format", opts.bodyFormat);
  if (opts.title) url.searchParams.set("title", opts.title);
  url.searchParams.set("sort", "-modified-date");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: authHeader(auth.accessToken),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.error(`Confluence v2 pages fetch failed (${res.status}):`, await res.text());
    return [];
  }

  const data: ConfluenceV2PageResponse = await res.json();
  const baseUrl = data._links?.base ?? "";

  return data.results.map((r) => ({
    id: r.id,
    title: r.title,
    bodyText: stripHtml(r.body?.storage?.value ?? ""),
    labels: [],
    url: r._links?.webui ? `${baseUrl}${r._links.webui}` : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Get page by ID using V2 API (works with read:page:confluence scope)
// ---------------------------------------------------------------------------

export async function getPageById(
  pageId: string,
  env: Env,
  auth: AtlassianAuth,
): Promise<ConfluencePage | null> {
  try {
    const url = new URL(`https://api.atlassian.com/ex/confluence/${auth.cloudId}/wiki/api/v2/pages/${pageId}`);
    url.searchParams.set("body-format", "storage");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: authHeader(auth.accessToken),
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.error(`Confluence getPageById failed (${res.status}):`, await res.text());
      return null;
    }

    const r = (await res.json()) as ConfluenceV2Page;
    const base = r._links?.base ?? "";

    return {
      id: r.id,
      title: r.title,
      bodyText: stripHtml(r.body?.storage?.value ?? ""),
      labels: [],
      url: r._links?.webui ? `${base}${r._links.webui}` : undefined,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a search term from simple CQL like: title ~ "foo" OR text ~ "foo" */
function extractTitleFromCql(cql: string): string | null {
  const match = cql.match(/(?:title|text)\s*~\s*"([^"*]+)/);
  return match ? match[1] : null;
}
