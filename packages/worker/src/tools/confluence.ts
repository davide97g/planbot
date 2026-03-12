import {
  createToolDefinition,
  parametersSchema,
  stringProp,
} from "@planbot/shared/tool-schemas";
import type { Env, ToolDefinition } from "../types";
import { searchPages, getPageById, extractPageIdFromUrl } from "../confluence";
import { getAtlassianAccessToken } from "../api/atlassian-oauth";

export const tools: ToolDefinition[] = [
  createToolDefinition(
    "search_confluence_pages",
    "Search Confluence pages using a CQL query",
    parametersSchema({ cql: stringProp({ description: "CQL query string" }) }, ["cql"]),
  ),
  createToolDefinition(
    "get_confluence_page",
    "Get a Confluence page by title (text search) or by URL. If a Confluence URL is provided, the page ID is extracted automatically.",
    parametersSchema({ query: stringProp({ description: "Page title to search for, or a full Confluence URL" }) }, ["query"]),
  ),
];

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  env: Env,
  userId?: string,
): Promise<unknown> {
  // Resolve OAuth token (throws if not connected)
  if (!userId) {
    throw new Error("Atlassian account not connected. Please visit /api/auth/atlassian/connect");
  }
  const auth = await getAtlassianAccessToken(userId, env);

  switch (name) {
    case "search_confluence_pages":
      return searchPages(args.cql as string, env, auth);
    case "get_confluence_page": {
      const query = args.query as string;

      // Check if the query is a Confluence URL
      const pageId = extractPageIdFromUrl(query);
      if (pageId) {
        return await getPageById(pageId, env, auth);
      }

      // Otherwise search by text (more flexible than exact title match)
      const pages = await searchPages(`text ~ "${query}" OR title ~ "${query}"`, env, auth);
      return pages[0] ?? null;
    }
    default:
      throw new Error(`Unknown confluence tool: ${name}`);
  }
}
