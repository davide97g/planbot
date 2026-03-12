import type { Env } from "../types";
import { handleLogin, verifyAuth } from "./auth";
import { handleChat } from "./chat";
import {
  loadConversation,
  listConversations,
  deleteConversation,
  updateConversationTitle,
} from "../chat/conversation";
import { searchIssues } from "../jira";
import { searchPages, getPageById, extractPageIdFromUrl } from "../confluence";
import {
  handleAtlassianConnect,
  handleAtlassianCallback,
  hasAtlassianToken,
  getAtlassianAccessToken,
  disconnectAtlassian,
} from "./atlassian-oauth";
import { handleDemoGenerate } from "./demo-data";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
};

function corsResponse(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function corsJson(data: unknown, status = 200): Response {
  return corsResponse(Response.json(data, { status }));
}

// ---------------------------------------------------------------------------
// Slack handler (preserved from original index.ts)
// ---------------------------------------------------------------------------

async function handleSlack(request: Request, env: Env): Promise<Response> {
  // Dynamically import the Slack-specific logic that was in the original index.
  // We inline the Slack handling here since it was previously the entire fetch handler.

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const valid = await verifySlackSignature(request, env.SLACK_SIGNING_SECRET);
  if (!valid) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.text();
  const params = new URLSearchParams(body);

  const commandText = params.get("text") ?? "";
  const responseUrl = params.get("response_url") ?? "";
  const channelId = params.get("channel_id") ?? "";
  const userId = params.get("user_id") ?? "";

  let parsed: ParsedSlackInput;
  try {
    parsed = parseSlackCommandText(commandText);
  } catch {
    return Response.json(
      {
        response_type: "ephemeral",
        text: "Invalid command. Run `/planbot help` for usage information.",
      },
      { status: 200 },
    );
  }

  if (parsed.command === "help") {
    return slackHelpResponse();
  }

  const teamConfigName = parsed.flags.team ?? "default";

  const job = {
    command: parsed.command,
    args: parsed.args,
    flags: parsed.flags,
    response_url: responseUrl,
    channel_id: channelId,
    user_id: userId,
    team_config_name: teamConfigName,
  };

  await env.PLANBOT_QUEUE.send(job);

  return Response.json(
    {
      response_type: "ephemeral",
      text: "Processing your planning request...",
    },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// Slack helpers (moved from original index.ts)
// ---------------------------------------------------------------------------

async function verifySlackSignature(
  request: Request,
  signingSecret: string,
): Promise<boolean> {
  const signature = request.headers.get("x-slack-signature");
  const timestamp = request.headers.get("x-slack-request-timestamp");

  if (!signature || !timestamp) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const body = await request.clone().text();
  const baseString = `v0:${timestamp}:${body}`;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(baseString),
  );

  const computed =
    "v0=" +
    Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  if (computed.length !== signature.length) return false;

  const a = encoder.encode(computed);
  const b = encoder.encode(signature);
  if (typeof crypto.subtle.timingSafeEqual === "function") {
    return crypto.subtle.timingSafeEqual(a, b);
  }

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a[i] ^ b[i];
  }
  return mismatch === 0;
}

type PlanCommand = "release" | "sprint" | "jql" | "help";

interface ParsedSlackInput {
  command: PlanCommand;
  args: string;
  flags: { team?: string; from?: string; to?: string };
}

const VALID_COMMANDS: PlanCommand[] = ["release", "sprint", "jql", "help"];

function parseSlackCommandText(text: string): ParsedSlackInput {
  const tokens = text.trim().split(/\s+/);
  const command = (tokens[0] ?? "help").toLowerCase();

  if (!VALID_COMMANDS.includes(command as PlanCommand)) {
    throw new Error("Invalid command");
  }

  const flags: Record<string, string> = {};
  const argTokens: string[] = [];

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    const flagMatch = token.match(/^--(\w+)$/);
    if (flagMatch && i + 1 < tokens.length) {
      flags[flagMatch[1]] = tokens[i + 1];
      i += 2;
    } else {
      argTokens.push(token);
      i++;
    }
  }

  return {
    command: command as PlanCommand,
    args: argTokens.join(" "),
    flags,
  };
}

function slackHelpResponse(): Response {
  const usage = [
    "*PlanBot — AI-powered planning assistant*",
    "",
    "`/planbot release <version>` — Generate a release plan",
    "`/planbot sprint` — Generate the upcoming sprint plan",
    "`/planbot jql <JQL query>` — Plan tasks matching a JQL query",
    "`/planbot help` — Show this message",
    "",
    "*Flags (optional):*",
    "`--team <name>` — Target team configuration",
    "`--from <YYYY-MM-DD>` — Start date for the planning horizon",
    "`--to <YYYY-MM-DD>` — End date for the planning horizon",
  ].join("\n");

  return Response.json(
    { response_type: "ephemeral", text: usage },
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// File upload handler
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_PREFIXES = ["image/", "text/", "application/pdf", "application/csv", "text/csv"];

async function handleFileUpload(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return corsJson({ error: "Expected multipart/form-data" }, 400);
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return corsJson({ error: "No file provided" }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return corsJson({ error: "File too large (max 10MB)" }, 400);
  }

  const mimeType = file.type || "application/octet-stream";
  const isAllowed = ALLOWED_MIME_PREFIXES.some(
    (prefix) => mimeType.startsWith(prefix),
  );
  if (!isAllowed) {
    return corsJson(
      { error: `File type ${mimeType} not supported` },
      400,
    );
  }

  const fileId = crypto.randomUUID();
  const key = `${userId}/${fileId}/${file.name}`;

  await env.PLANBOT_FILES.put(key, file.stream(), {
    httpMetadata: { contentType: mimeType },
    customMetadata: { userId, originalName: file.name },
  });

  return corsJson({
    id: fileId,
    name: file.name,
    mimeType,
    size: file.size,
    key,
  });
}

// ---------------------------------------------------------------------------
// Search handler (for @-mention autocomplete)
// ---------------------------------------------------------------------------

async function handleSearch(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const query = url.searchParams.get("q") ?? "";

  if (!query) {
    return corsJson({ results: [] });
  }

  let auth: { accessToken: string; cloudId: string } | null = null;
  try {
    auth = await getAtlassianAccessToken(userId, env);
  } catch {
    // User hasn't connected Atlassian — return empty results
    return corsJson({ results: [] });
  }

  if (type === "jira") {
    try {
      // Detect Jira URL: extract issue key from URLs like .../browse/PROJ-123
      const jiraUrlMatch = query.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i);
      const jiraKey = jiraUrlMatch ? jiraUrlMatch[1].toUpperCase() : null;

      // Detect issue key pattern like BAT-3310
      const isIssueKey = /^[A-Z][A-Z0-9]+-\d+$/i.test(query.trim());

      let jql: string;
      if (jiraKey) {
        jql = `key = "${jiraKey}"`;
      } else if (isIssueKey) {
        jql = `key = "${query.trim().toUpperCase()}"`;
      } else {
        // Escape special JQL chars in text search
        const escaped = query.replace(/[\\"\[\](){}~*?^!|&]/g, "\\$&");
        jql = `summary ~ "${escaped}" ORDER BY updated DESC`;
      }

      const issues = await searchIssues(jql, env, auth);
      const results = issues.slice(0, 10).map((issue) => ({
        type: "jira" as const,
        id: issue.key,
        display: issue.summary,
        issueType: issue.issueType,
        status: issue.status,
        url: `${env.JIRA_BASE_URL}/browse/${issue.key}`,
      }));
      return corsJson({ results });
    } catch {
      return corsJson({ results: [] });
    }
  }

  if (type === "confluence") {
    try {
      // Detect Confluence URL: extract page ID from URLs like .../pages/12345/...
      const pageId = extractPageIdFromUrl(query);

      if (pageId) {
        // Fetch specific page by ID
        const page = await getPageById(pageId, env, auth);
        if (page) {
          return corsJson({
            results: [
              {
                type: "confluence" as const,
                id: page.id,
                display: page.title,
                summary:
                  page.bodyText.slice(0, 120) +
                  (page.bodyText.length > 120 ? "..." : ""),
                url: query,
              },
            ],
          });
        }
        return corsJson({ results: [] });
      }

      // Text search using V2 pages API with title filter
      const pages = await searchPages(
        "",
        env,
        auth,
        query,
      );
      const results = pages.slice(0, 10).map((page) => ({
        type: "confluence" as const,
        id: page.id,
        display: page.title,
        summary:
          page.bodyText.slice(0, 120) +
          (page.bodyText.length > 120 ? "..." : ""),
        url: page.url,
      }));
      return corsJson({ results });
    } catch {
      return corsJson({ results: [] });
    }
  }

  return corsJson({ error: "type must be 'jira' or 'confluence'" }, 400);
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export async function routeRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Slack webhook — preserved as-is
  if (path === "/slack" && method === "POST") {
    return handleSlack(request, env);
  }

  // Auth login — no bearer token required
  if (path === "/api/auth/login" && method === "POST") {
    return corsResponse(await handleLogin(request, env));
  }

  // OAuth callback — public (called by Atlassian redirect, no JWT required)
  if (path === "/api/auth/atlassian/callback" && method === "GET") {
    return corsResponse(await handleAtlassianCallback(request, env));
  }

  // ---------------------------------------------------------------------------
  // All routes below require authentication
  // ---------------------------------------------------------------------------

  if (path.startsWith("/api/")) {
    const auth = await verifyAuth(request, env);
    if (!auth) {
      return corsJson({ error: "Unauthorized" }, 401);
    }

    const { userId } = auth;

    // GET /api/auth/atlassian/connect — returns { url } JSON for frontend to navigate to
    if (path === "/api/auth/atlassian/connect" && method === "GET") {
      return corsResponse(await handleAtlassianConnect(request, env, userId));
    }

    // GET /api/auth/atlassian/status — check if Atlassian is connected
    if (path === "/api/auth/atlassian/status" && method === "GET") {
      const connected = await hasAtlassianToken(userId, env);
      return corsJson({ connected });
    }

    // DELETE /api/auth/atlassian/token — disconnect Atlassian
    if (path === "/api/auth/atlassian/token" && method === "DELETE") {
      await disconnectAtlassian(userId, env);
      return corsJson({ ok: true });
    }

    // POST /api/chat — SSE streaming chat
    if (path === "/api/chat" && method === "POST") {
      return corsResponse(await handleChat(request, env, userId));
    }

    // POST /api/upload — file attachment upload to R2
    if (path === "/api/upload" && method === "POST") {
      return corsResponse(await handleFileUpload(request, env, userId));
    }

    // GET /api/chat/conversations — list conversations
    if (path === "/api/chat/conversations" && method === "GET") {
      const conversations = await listConversations(userId, env);
      return corsJson({ conversations });
    }

    // GET/DELETE /api/chat/conversations/:id
    const conversationMatch = path.match(
      /^\/api\/chat\/conversations\/([a-f0-9-]+)$/,
    );
    if (conversationMatch) {
      const conversationId = conversationMatch[1];

      if (method === "GET") {
        const conversation = await loadConversation(conversationId, env);
        if (!conversation) {
          return corsJson({ error: "Conversation not found" }, 404);
        }
        if (conversation.userId !== userId) {
          return corsJson({ error: "Forbidden" }, 403);
        }
        return corsJson({ conversation });
      }

      if (method === "DELETE") {
        await deleteConversation(conversationId, userId, env);
        return corsJson({ ok: true });
      }

      if (method === "PATCH") {
        let body: { title?: unknown };
        try {
          body = await request.json();
        } catch {
          return corsJson({ error: "Invalid JSON body" }, 400);
        }
        const title = body.title;
        if (typeof title !== "string" || !title.trim() || title.length > 200) {
          return corsJson(
            { error: "title must be a non-empty string ≤200 chars" },
            400,
          );
        }
        const updated = await updateConversationTitle(
          conversationId,
          userId,
          title.trim(),
          env,
        );
        if (!updated) {
          return corsJson({ error: "Not found" }, 404);
        }
        return corsJson({ ok: true });
      }
    }

    // GET /api/search — autocomplete for mentions
    if (path === "/api/search" && method === "GET") {
      return handleSearch(request, env, userId);
    }

    // POST /api/demo/generate — generate demo Jira issues & Confluence pages
    if (path === "/api/demo/generate" && method === "POST") {
      return corsResponse(await handleDemoGenerate(request, env, userId));
    }

    // GET /api/slack/channels — list Slack channels for # autocomplete
    if (path === "/api/slack/channels" && method === "GET") {
      try {
        if (!env.SLACK_BOT_TOKEN) {
          return corsJson({ channels: [] });
        }
        const res = await fetch(
          "https://slack.com/api/conversations.list?types=public_channel&limit=200&exclude_archived=true",
          { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } },
        );
        const data = (await res.json()) as {
          ok: boolean;
          channels?: { id: string; name: string }[];
          error?: string;
        };
        if (!data.ok) {
          return corsJson({ channels: [], error: data.error });
        }
        const channels = (data.channels || []).map((c) => ({
          id: c.id,
          name: c.name,
        }));
        return corsJson({ channels });
      } catch {
        return corsJson({ channels: [] });
      }
    }

    // GET /api/sprints — list sprints for autocomplete (active first)
    if (path === "/api/sprints" && method === "GET") {
      try {
        const auth = await getAtlassianAccessToken(userId, env);
        const boardRes = await fetch(
          `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/agile/1.0/board?maxResults=10`,
          { headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } },
        );
        if (!boardRes.ok) return corsJson({ sprints: [] });
        const boardData = (await boardRes.json()) as { values: { id: number; name: string }[] };

        const sprints: { id: number; name: string; state: string; startDate?: string; endDate?: string; boardId: number; boardName: string }[] = [];
        for (const board of boardData.values.slice(0, 5)) {
          const sprintRes = await fetch(
            `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/agile/1.0/board/${board.id}/sprint?state=active,closed&maxResults=10`,
            { headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } },
          );
          if (!sprintRes.ok) continue;
          const sprintData = (await sprintRes.json()) as {
            values: { id: number; name: string; state: string; startDate?: string; endDate?: string }[];
          };
          for (const s of sprintData.values) {
            sprints.push({ id: s.id, name: s.name, state: s.state, startDate: s.startDate, endDate: s.endDate, boardId: board.id, boardName: board.name });
          }
        }

        // Sort: active first, then by startDate descending
        sprints.sort((a, b) => {
          if (a.state === "active" && b.state !== "active") return -1;
          if (b.state === "active" && a.state !== "active") return 1;
          return (b.startDate ?? "").localeCompare(a.startDate ?? "");
        });

        return corsJson({ sprints });
      } catch {
        return corsJson({ sprints: [] });
      }
    }

    // GET /api/workspace — Jira board + Confluence base URLs for sidebar links
    if (path === "/api/workspace" && method === "GET") {
      try {
        const auth = await getAtlassianAccessToken(userId, env);

        // Resolve the actual site URL from the accessible resources API
        let siteUrl = env.JIRA_BASE_URL;
        try {
          const resRes = await fetch(
            "https://api.atlassian.com/oauth/token/accessible-resources",
            { headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } },
          );
          if (resRes.ok) {
            const resources = (await resRes.json()) as { id: string; url: string }[];
            const site = resources.find((r) => r.id === auth.cloudId);
            if (site?.url) siteUrl = site.url;
          }
        } catch { /* fall back to env */ }

        // Fetch first board for Jira link
        const boardRes = await fetch(
          `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/agile/1.0/board?maxResults=1`,
          { headers: { Authorization: `Bearer ${auth.accessToken}`, Accept: "application/json" } },
        );
        let jiraBoard: { id: number; name: string; url: string } | null = null;
        if (boardRes.ok) {
          const boardData = (await boardRes.json()) as {
            values: { id: number; name: string; self: string; location?: { projectKey?: string } }[];
          };
          const b = boardData.values[0];
          if (b) {
            const projectKey = b.location?.projectKey;
            const boardUrl = projectKey
              ? `${siteUrl}/jira/software/projects/${projectKey}/boards/${b.id}`
              : `${siteUrl}/jira/software/board/${b.id}`;
            jiraBoard = { id: b.id, name: b.name, url: boardUrl };
          }
        }

        // Confluence URL — use the same site base
        const confluenceUrl = `${siteUrl}/wiki`;

        return corsJson({ jiraBoard, confluenceUrl });
      } catch {
        return corsJson({ jiraBoard: null, confluenceUrl: null });
      }
    }

    // Memory CRUD — /api/memory
    if (path === "/api/memory") {
      const { loadMemory, saveMemory } = await import("../tools/memory");
      if (method === "GET") {
        const memory = await loadMemory(userId, env);
        return corsJson({ entries: memory.entries });
      }
      if (method === "POST") {
        let body: unknown;
        try { body = await request.json(); } catch { return corsJson({ error: "Invalid JSON" }, 400); }
        const b = body as { title?: string; content?: string; category?: string; alwaysInclude?: boolean };
        if (!b.title || !b.content) return corsJson({ error: "title and content are required" }, 400);
        const memory = await loadMemory(userId, env);
        const entry = {
          id: crypto.randomUUID(),
          title: b.title,
          content: b.content,
          category: (b.category ?? "fact") as import("../types").MemoryEntry["category"],
          alwaysInclude: b.alwaysInclude ?? true,
          createdAt: new Date().toISOString().slice(0, 10),
          source: "user" as const,
        };
        memory.entries.push(entry);
        await saveMemory(userId, memory, env);
        return corsJson({ entry });
      }
    }

    if (path.startsWith("/api/memory/")) {
      const entryId = path.slice("/api/memory/".length);
      const { loadMemory, saveMemory } = await import("../tools/memory");
      const memory = await loadMemory(userId, env);
      const idx = memory.entries.findIndex((e) => e.id === entryId);
      if (method === "PUT") {
        let body: unknown;
        try { body = await request.json(); } catch { return corsJson({ error: "Invalid JSON" }, 400); }
        if (idx === -1) return corsJson({ error: "Not found" }, 404);
        memory.entries[idx] = { ...memory.entries[idx], ...(body as object) };
        await saveMemory(userId, memory, env);
        return corsJson({ entry: memory.entries[idx] });
      }
      if (method === "DELETE") {
        if (idx === -1) return corsJson({ error: "Not found" }, 404);
        memory.entries.splice(idx, 1);
        await saveMemory(userId, memory, env);
        return corsJson({ ok: true });
      }
    }

    // POST /api/settings/notifications/test — send a test Slack DM
    if (path === "/api/settings/notifications/test" && method === "POST") {
      let bodySlackUserId: string | undefined;
      try {
        const body = await request.json() as { slackUserId?: string };
        bodySlackUserId = body?.slackUserId;
      } catch { /* no body */ }
      const raw = await env.PLANBOT_CONFIG.get(`notifications:${userId}`);
      const prefs = raw ? JSON.parse(raw) as { slackUserId?: string } : null;
      const slackUserId = bodySlackUserId || prefs?.slackUserId;
      if (!slackUserId) {
        return corsJson({ error: "No Slack user ID configured in notification preferences" }, 400);
      }
      try {
        const { sendSlackDM } = await import("../notifications/delivery");
        await sendSlackDM(slackUserId, "🔔 *Planbot test notification* — your notification settings are working correctly!", env);
        return corsJson({ ok: true });
      } catch (err) {
        return corsJson({ error: err instanceof Error ? err.message : "Failed to send notification" }, 500);
      }
    }

    // GET/PUT /api/settings/notifications — notification preferences
    if (path === "/api/settings/notifications") {
      if (method === "GET") {
        const raw = await env.PLANBOT_CONFIG.get(`notifications:${userId}`);
        const prefs = raw ? JSON.parse(raw) : null;
        return corsJson({ preferences: prefs });
      }
      if (method === "PUT") {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return corsJson({ error: "Invalid JSON body" }, 400);
        }
        await env.PLANBOT_CONFIG.put(
          `notifications:${userId}`,
          JSON.stringify(body),
        );
        return corsJson({ ok: true });
      }
    }

    // GET /api/settings — return LLM provider info
    if (path === "/api/settings" && method === "GET") {
      return corsJson({
        provider: env.LLM_PROVIDER || "openai",
        model: env.LLM_PROVIDER === "anthropic" ? "claude-sonnet-4-5-20250514" : "gpt-4o",
      });
    }

    return corsJson({ error: "Not Found" }, 404);
  }

  // Fallback
  return new Response("Not Found", { status: 404 });
}
