import type { Env, Mention } from "../types";
import { searchIssues } from "../jira";
import { searchPages, getPageById } from "../confluence";
import { getAtlassianAccessToken } from "../api/atlassian-oauth";
import { loadMemory } from "../tools/memory";

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

  // Slack channel chips: [#:channelId:channelName]
  const slackTagRegex = /\[#:([^:]+):([^\]]+)\]/g;
  while ((match = slackTagRegex.exec(text)) !== null) {
    const channelId = match[1];
    const channelName = match[2];
    const id = `slack:${channelId}`;
    if (!seen.has(id)) {
      seen.add(id);
      mentions.push({
        type: "slack",
        id: channelId,
        display: `#${channelName}`,
      });
    }
  }

  // Memory chips: [M:memoryId:title]
  const memoryChipRegex = /\[M:([^:]+):([^\]]+)\]/g;
  while ((match = memoryChipRegex.exec(text)) !== null) {
    const entryId = match[1];
    const id = `memory:${entryId}`;
    if (!seen.has(id)) {
      seen.add(id);
      mentions.push({
        type: "memory",
        id: entryId,
        display: match[2],
      });
    }
  }

  // Sprint chips: [SP:sprintId:sprintName]
  const sprintTagRegex = /\[SP:([^:]+):([^\]]+)\]/g;
  while ((match = sprintTagRegex.exec(text)) !== null) {
    const sprintId = match[1];
    const sprintName = match[2];
    const id = `sprint:${sprintId}`;
    if (!seen.has(id)) {
      seen.add(id);
      mentions.push({
        type: "sprint",
        id: sprintId,
        display: sprintName,
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

  // Memory mentions: @memory:entry-id (short or full UUID)
  const memoryRegex = /@memory:([a-zA-Z0-9_-]+)/g;
  while ((match = memoryRegex.exec(text)) !== null) {
    const entryId = match[1];
    const id = `memory:${entryId}`;
    if (!seen.has(id)) {
      seen.add(id);
      mentions.push({
        type: "memory",
        id: entryId,
        display: `@memory:${entryId}`,
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
  // Strip memory tags (both formats): @memory:id and [M:id:title]
  result = result.replace(/@memory:[a-zA-Z0-9_-]+/g, "");
  result = result.replace(/\[M:[^:]+:[^\]]+\]/g, "");
  // Strip Slack channel tags: [#:channelId:name] → #name
  result = result.replace(/\[#:[^:]+:([^\]]+)\]/g, "#$1");
  // Strip Sprint tags: [SP:id:name] → Sprint: name
  result = result.replace(/\[SP:[^:]+:([^\]]+)\]/g, "Sprint: $1");
  return result.trim();
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
  userId: string,
): Promise<Mention[]> {
  let auth: { accessToken: string; cloudId: string };
  try {
    auth = await getAtlassianAccessToken(userId, env);
  } catch {
    // User hasn't connected Atlassian — return mentions unresolved
    return mentions;
  }

  // Resolve memory mentions separately (no Atlassian auth needed)
  const memoryMentions = mentions.filter((m) => m.type === "memory");
  let resolvedMemory: Map<string, string> = new Map();
  if (memoryMentions.length > 0) {
    try {
      const memory = await loadMemory(userId, env);
      for (const m of memoryMentions) {
        // Match by full ID or by short prefix (first 8 chars)
        const entry = memory.entries.find(
          (e) => e.id === m.id || e.id.startsWith(m.id),
        );
        if (entry) {
          resolvedMemory.set(m.id, `**${entry.title}**\n${entry.content}`);
        }
      }
    } catch { /* ignore */ }
  }

  const resolved = await Promise.all(
    mentions.map(async (mention) => {
      if (mention.type === "memory") {
        const content = resolvedMemory.get(mention.id);
        if (content) {
          return { ...mention, resolved: { summary: content } };
        }
        return mention;
      }
      // Slack channels — inject channel name as context (no API call needed)
      if (mention.type === "slack") {
        return {
          ...mention,
          resolved: { summary: `Slack channel ${mention.display}` },
        };
      }
      // Sprints — inject sprint name as context
      if (mention.type === "sprint") {
        return {
          ...mention,
          resolved: { summary: `Sprint: ${mention.display}` },
        };
      }
      try {
        if (mention.type === "jira") {
          const issues = await searchIssues(`key = "${mention.id}"`, env, auth);
          if (issues.length > 0) {
            const issue = issues[0];
            return {
              ...mention,
              resolved: {
                summary: issue.summary,
                status: issue.status,
              },
            };
          }
        } else if (mention.type === "confluence") {
          // mention.id can be a numeric page ID (from tag chips) or a title (from @confluence: mentions)
          const isPageId = /^\d+$/.test(mention.id);

          if (isPageId) {
            // Fetch directly by ID — reliable, avoids CQL mismatches
            const page = await getPageById(mention.id, env, auth);
            if (page) {
              // Truncate body for context (first 2000 chars)
              const bodyPreview = page.bodyText.length > 2000
                ? page.bodyText.slice(0, 2000) + "..."
                : page.bodyText;
              return {
                ...mention,
                resolved: {
                  summary: `${page.title}\n\nPage content:\n${bodyPreview}`,
                },
              };
            }
          } else {
            const pages = await searchPages(`title = "${mention.id}"`, env, auth);
            if (pages.length > 0) {
              const page = pages[0];
              return {
                ...mention,
                resolved: {
                  summary: page.title,
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
