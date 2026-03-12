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
// Search handler (for @-mention autocomplete)
// ---------------------------------------------------------------------------

async function handleSearch(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const query = url.searchParams.get("q") ?? "";

  if (!query) {
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

      const issues = await searchIssues(jql, env);
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
        const page = await getPageById(pageId, env);
        if (page) {
          return corsJson({
            results: [
              {
                type: "confluence" as const,
                id: page.id,
                display: page.title,
                summary: page.bodyText.slice(0, 120) + (page.bodyText.length > 120 ? "..." : ""),
                url: query,
              },
            ],
          });
        }
        return corsJson({ results: [] });
      }

      // Text search
      const pages = await searchPages(`title ~ "${query}" OR text ~ "${query}"`, env);
      const results = pages.slice(0, 10).map((page) => ({
        type: "confluence" as const,
        id: page.id,
        display: page.title,
        summary: page.bodyText.slice(0, 120) + (page.bodyText.length > 120 ? "..." : ""),
        url: `${env.CONFLUENCE_BASE_URL}/wiki/pages/viewpage.action?pageId=${page.id}`,
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

  // ---------------------------------------------------------------------------
  // All routes below require authentication
  // ---------------------------------------------------------------------------

  if (path.startsWith("/api/")) {
    const auth = await verifyAuth(request, env);
    if (!auth) {
      return corsJson({ error: "Unauthorized" }, 401);
    }

    const { userId } = auth;

    // POST /api/chat — SSE streaming chat
    if (path === "/api/chat" && method === "POST") {
      return corsResponse(await handleChat(request, env, userId));
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
          return corsJson({ error: "title must be a non-empty string ≤200 chars" }, 400);
        }
        const updated = await updateConversationTitle(conversationId, userId, title.trim(), env);
        if (!updated) {
          return corsJson({ error: "Not found" }, 404);
        }
        return corsJson({ ok: true });
      }
    }

    // GET /api/search — autocomplete for mentions
    if (path === "/api/search" && method === "GET") {
      return handleSearch(request, env);
    }

    return corsJson({ error: "Not Found" }, 404);
  }

  // Fallback
  return new Response("Not Found", { status: 404 });
}
