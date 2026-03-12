import type { Env, Mention } from "../types";
import { searchIssues } from "../jira";
import { searchPages, getPageById } from "../confluence";

// ---------------------------------------------------------------------------
// Mention parsing
// ---------------------------------------------------------------------------

/**
 * Parse @-mentions from chat text.
 *
 * Supported patterns:
 *   @PROJ-123          — Jira issue (project key + number)
 *   @confluence:title   — Confluence page by title
 *   [S:PROJ-123]       — Tagged resource chip (Jira)
 */
export function parseMentions(text: string): Mention[] {
  const mentions: Mention[] = [];
  const seen = new Set<string>();

  // Resource tag chips — Jira: [S:BAT-3246], [B:PROJ-123], etc.
  const jiraTagRegex = /\[([A-Z]{1,2}):([A-Z][A-Z0-9]+-\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = jiraTagRegex.exec(text)) !== null) {
    if (match[1] === "C") continue; // Confluence handled separately
    const key = match[2];
    const id = `jira:${key}`;
    if (!seen.has(id)) {
      seen.add(id);
      mentions.push({
        type: "jira",
        id: key,
        display: key,
      });
    }
  }

  // Resource tag chips — Confluence: [C:pageId:Page Title]
  const confluenceTagRegex = /\[C:(\d+):([^\]]+)\]/g;
  while ((match = confluenceTagRegex.exec(text)) !== null) {
    const pageId = match[1];
    const pageTitle = match[2];
    const id = `confluence:${pageId}`;
    if (!seen.has(id)) {
      seen.add(id);
      mentions.push({
        type: "confluence",
        id: pageId,
        display: pageTitle,
      });
    }
  }

  // Jira mentions: @PROJ-123 (uppercase project key, dash, digits)
  const jiraRegex = /@([A-Z][A-Z0-9]+-\d+)/g;
  while ((match = jiraRegex.exec(text)) !== null) {
    const key = match[1];
    const id = `jira:${key}`;
    if (!seen.has(id)) {
      seen.add(id);
      mentions.push({
        type: "jira",
        id: key,
        display: `@${key}`,
      });
    }
  }

  // Confluence mentions: @confluence:page-title (alphanumeric, hyphens, spaces until end of word boundary)
  const confluenceRegex = /@confluence:([^\s]+(?:\s[^\s@]+)*?)(?=\s@|\s*$)/g;
  while ((match = confluenceRegex.exec(text)) !== null) {
    const title = match[1].trim();
    const id = `confluence:${title}`;
    if (!seen.has(id)) {
      seen.add(id);
      mentions.push({
        type: "confluence",
        id: title,
        display: `@confluence:${title}`,
      });
    }
  }

  return mentions;
}

/**
 * Strip resource tag tokens from message text and replace with plain issue keys.
 * e.g. "[S:BAT-3246] status update" → "BAT-3246 status update"
 */
export function stripResourceTags(text: string): string {
  // Strip Jira tags: [S:BAT-3246] → BAT-3246
  let result = text.replace(/\[([A-Z]{1,2}):([A-Z][A-Z0-9]+-\d+)\]/g, "$2");
  // Strip Confluence tags: [C:12345:Page Title] → Page Title
  result = result.replace(/\[C:(\d+):([^\]]+)\]/g, "$2");
  return result;
}

// ---------------------------------------------------------------------------
// Mention resolution
// ---------------------------------------------------------------------------

/**
 * Resolve mentions by fetching metadata from Jira/Confluence.
 * Returns the same mentions with `resolved` data populated.
 */
export async function resolveMentions(
  mentions: Mention[],
  env: Env,
): Promise<Mention[]> {
  const resolved = await Promise.all(
    mentions.map(async (mention) => {
      try {
        if (mention.type === "jira") {
          const issues = await searchIssues(`key = "${mention.id}"`, env);
          if (issues.length > 0) {
            const issue = issues[0];
            return {
              ...mention,
              resolved: {
                summary: issue.summary,
                status: issue.status,
                url: `${env.JIRA_BASE_URL}/browse/${mention.id}`,
              },
            };
          }
        } else if (mention.type === "confluence") {
          // mention.id can be a numeric page ID (from tag chips) or a title (from @confluence: mentions)
          const isPageId = /^\d+$/.test(mention.id);

          if (isPageId) {
            // Fetch directly by ID — reliable, avoids CQL mismatches
            const page = await getPageById(mention.id, env);
            if (page) {
              // Truncate body for context (first 2000 chars)
              const bodyPreview = page.bodyText.length > 2000
                ? page.bodyText.slice(0, 2000) + "..."
                : page.bodyText;
              return {
                ...mention,
                resolved: {
                  summary: `${page.title}\n\nPage content:\n${bodyPreview}`,
                  url: `${env.CONFLUENCE_BASE_URL}/wiki/pages/viewpage.action?pageId=${page.id}`,
                },
              };
            }
          } else {
            const pages = await searchPages(`title = "${mention.id}"`, env);
            if (pages.length > 0) {
              const page = pages[0];
              return {
                ...mention,
                resolved: {
                  summary: page.title,
                  url: `${env.CONFLUENCE_BASE_URL}/wiki/pages/viewpage.action?pageId=${page.id}`,
                },
              };
            }
          }
        }
      } catch {
        // Silently skip resolution failures — the mention still appears unresolved
      }

      return mention;
    }),
  );

  return resolved;
}
