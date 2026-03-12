import type { Env } from "../types";
import { getAtlassianAccessToken } from "./atlassian-oauth";

// ---------------------------------------------------------------------------
// Demo data definitions
// ---------------------------------------------------------------------------

interface DemoIssue {
  summary: string;
  issueType: string;
  priority: string;
  labels: string[];
  storyPoints: number | null;
  description: string;
}

interface DemoPage {
  title: string;
  body: string;
}

const TEAM_MEMBERS = [
  "Alice Chen", "Bob Martinez", "Carol Smith", "Dave Kim",
  "Eve Johnson", "Frank Lee", "Grace Wang", "Henry Brown",
];

const ISSUE_TYPES = ["Story", "Bug", "Task", "Sub-task"];
const PRIORITIES = ["Highest", "High", "Medium", "Low", "Lowest"];
const LABELS_POOL = [
  "frontend", "backend", "api", "database", "security",
  "performance", "ux", "mobile", "infra", "testing",
  "documentation", "tech-debt", "accessibility", "analytics",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], min: number, max: number): T[] {
  const n = min + Math.floor(Math.random() * (max - min + 1));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randomPoints(): number | null {
  const opts = [null, 1, 2, 3, 5, 8, 13];
  return pick(opts);
}

function generateJiraIssues(): DemoIssue[] {
  const issues: DemoIssue[] = [
    // Auth & User Management
    { summary: "Implement SSO login with SAML 2.0", issueType: "Story", priority: "High", labels: ["backend", "security"], storyPoints: 8, description: "Add SAML 2.0 SSO authentication flow to support enterprise customers. Must integrate with existing JWT session management." },
    { summary: "Fix session expiry not redirecting to login page", issueType: "Bug", priority: "Highest", labels: ["frontend", "security"], storyPoints: 3, description: "Users see a blank screen when their session expires instead of being redirected to the login page. Affects all authenticated routes." },
    { summary: "Add role-based access control for admin panel", issueType: "Story", priority: "High", labels: ["backend", "security"], storyPoints: 13, description: "Implement RBAC system with admin, editor, and viewer roles. Admin panel should only be accessible to users with admin role." },
    { summary: "Create user profile settings page", issueType: "Story", priority: "Medium", labels: ["frontend", "ux"], storyPoints: 5, description: "Design and implement user profile page where users can update their display name, avatar, email preferences, and notification settings." },
    { summary: "Password reset email not sending in production", issueType: "Bug", priority: "Highest", labels: ["backend", "infra"], storyPoints: 2, description: "Password reset emails work in staging but fail silently in production. Likely an SMTP configuration issue with the production mail relay." },

    // Dashboard & Analytics
    { summary: "Build executive summary dashboard widget", issueType: "Story", priority: "High", labels: ["frontend", "analytics"], storyPoints: 8, description: "Create a dashboard widget showing KPIs: active users, sprint velocity, burndown progress, and team capacity utilization." },
    { summary: "Add export to PDF for sprint reports", issueType: "Story", priority: "Medium", labels: ["frontend", "backend"], storyPoints: 5, description: "Users should be able to export sprint reports as PDF documents with charts, tables, and formatted text." },
    { summary: "Chart rendering crashes with large datasets", issueType: "Bug", priority: "High", labels: ["frontend", "performance"], storyPoints: 3, description: "The burndown chart component throws a memory error when rendering more than 500 data points. Need to implement data sampling or virtualization." },
    { summary: "Implement real-time dashboard updates via WebSocket", issueType: "Story", priority: "Medium", labels: ["frontend", "backend"], storyPoints: 8, description: "Replace polling-based dashboard updates with WebSocket connections for real-time data. Should gracefully fall back to polling if WS unavailable." },
    { summary: "Add team velocity trend chart over last 6 sprints", issueType: "Story", priority: "Low", labels: ["frontend", "analytics"], storyPoints: 5, description: "Display a line chart showing team velocity trends across the last 6 sprints with average and standard deviation bands." },

    // API & Integration
    { summary: "Create REST API for third-party integrations", issueType: "Story", priority: "High", labels: ["backend", "api"], storyPoints: 13, description: "Design and implement a public REST API with OpenAPI spec, rate limiting, and API key authentication for third-party integrations." },
    { summary: "Slack notification integration for sprint events", issueType: "Story", priority: "Medium", labels: ["backend", "api"], storyPoints: 5, description: "Send Slack notifications when sprints start/end, when items are blocked, or when capacity changes. Configurable per channel." },
    { summary: "Webhook delivery failing for large payloads", issueType: "Bug", priority: "High", labels: ["backend", "api"], storyPoints: 3, description: "Webhook deliveries timeout when payload exceeds 1MB. Need to implement payload truncation and pagination for large events." },
    { summary: "Add GitHub PR status sync to Jira issues", issueType: "Story", priority: "Medium", labels: ["backend", "api"], storyPoints: 8, description: "Automatically update Jira issue status when linked GitHub PRs are opened, reviewed, merged, or closed." },
    { summary: "Rate limiter not resetting after window expires", issueType: "Bug", priority: "Medium", labels: ["backend", "api"], storyPoints: 2, description: "API rate limit counters persist beyond their TTL window in Redis. Users remain rate-limited even after waiting the specified cooldown." },

    // Data & Database
    { summary: "Migrate user data to new schema with zero downtime", issueType: "Story", priority: "Highest", labels: ["backend", "database"], storyPoints: 13, description: "Implement a zero-downtime migration strategy for the user table schema change. Must support rollback and handle concurrent reads/writes." },
    { summary: "Add database connection pooling for Worker runtime", issueType: "Task", priority: "High", labels: ["backend", "database", "infra"], storyPoints: 5, description: "Implement connection pooling compatible with Cloudflare Workers using Hyperdrive or a similar pooling proxy." },
    { summary: "Optimize slow query on sprint history endpoint", issueType: "Bug", priority: "High", labels: ["backend", "database", "performance"], storyPoints: 3, description: "GET /api/sprints/history takes 8+ seconds for teams with 50+ sprints. Need to add proper indexes and consider denormalization." },
    { summary: "Implement data retention policy and auto-cleanup", issueType: "Story", priority: "Low", labels: ["backend", "database"], storyPoints: 5, description: "Add configurable data retention policies. Auto-delete conversation history, logs, and temporary data older than the configured period." },
    { summary: "KV storage approaching quota limits on free tier", issueType: "Bug", priority: "Medium", labels: ["infra", "database"], storyPoints: 3, description: "PLANBOT_CHAT KV namespace is at 85% capacity. Need to implement cleanup of old conversations and consider tiered storage." },

    // Frontend UI/UX
    { summary: "Redesign mobile responsive layout for chat view", issueType: "Story", priority: "Medium", labels: ["frontend", "mobile", "ux"], storyPoints: 8, description: "The chat interface is cramped on mobile devices. Redesign with a mobile-first approach: collapsible sidebar, touch-friendly inputs, and optimized message bubbles." },
    { summary: "Add dark mode support with system preference detection", issueType: "Story", priority: "Low", labels: ["frontend", "ux"], storyPoints: 5, description: "Implement dark mode theme with automatic detection of OS preference. Add manual toggle in user settings. Must work with all existing components." },
    { summary: "Conversation sidebar scroll position resets on new message", issueType: "Bug", priority: "Medium", labels: ["frontend", "ux"], storyPoints: 2, description: "When a new message arrives, the sidebar conversation list jumps to the top instead of maintaining the current scroll position." },
    { summary: "Implement keyboard shortcuts for power users", issueType: "Story", priority: "Low", labels: ["frontend", "ux", "accessibility"], storyPoints: 3, description: "Add keyboard shortcuts: Cmd+N (new chat), Cmd+K (search), Cmd+/ (help), Esc (close panels), Up/Down (navigate conversations)." },
    { summary: "Loading skeleton flickers on fast network connections", issueType: "Bug", priority: "Low", labels: ["frontend", "ux"], storyPoints: 1, description: "Skeleton loaders appear for a split second on fast connections, causing a visual flicker. Add a minimum delay before showing skeletons." },

    // Testing & Quality
    { summary: "Set up end-to-end test suite with Playwright", issueType: "Task", priority: "High", labels: ["testing", "infra"], storyPoints: 8, description: "Configure Playwright for E2E testing. Write tests for critical flows: login, chat, conversation management, and Atlassian OAuth." },
    { summary: "Add unit tests for agent runner tool execution", issueType: "Task", priority: "Medium", labels: ["testing", "backend"], storyPoints: 5, description: "Write comprehensive unit tests for the agent runner's tool execution loop, including error handling, max iterations, and abort signals." },
    { summary: "CI pipeline failing intermittently on test step", issueType: "Bug", priority: "High", labels: ["testing", "infra"], storyPoints: 3, description: "GitHub Actions test job fails roughly 20% of the time with timeout errors. Likely caused by flaky async tests or resource contention." },
    { summary: "Add integration tests for Atlassian OAuth flow", issueType: "Task", priority: "Medium", labels: ["testing", "security"], storyPoints: 5, description: "Create integration tests that mock the Atlassian OAuth endpoints and verify the full connect/callback/refresh/disconnect flow." },
    { summary: "Test coverage report showing incorrect percentages", issueType: "Bug", priority: "Low", labels: ["testing", "infra"], storyPoints: 1, description: "Vitest coverage report includes node_modules files in the calculation, showing artificially low coverage percentages." },

    // Infrastructure & DevOps
    { summary: "Set up staging environment on Cloudflare", issueType: "Task", priority: "High", labels: ["infra"], storyPoints: 5, description: "Create a staging Worker deployment with separate KV namespaces, queue, and environment variables. Add deployment script for staging." },
    { summary: "Implement structured logging with request tracing", issueType: "Story", priority: "Medium", labels: ["backend", "infra"], storyPoints: 5, description: "Add structured JSON logging with correlation IDs that trace requests through the orchestrator, agents, and tool calls." },
    { summary: "Worker cold start latency exceeding 500ms", issueType: "Bug", priority: "High", labels: ["infra", "performance"], storyPoints: 3, description: "First request to the Worker after idle period takes 500-800ms. Investigate lazy imports, bundle size, and Cloudflare cold start optimization." },
    { summary: "Add health check endpoint with dependency status", issueType: "Task", priority: "Medium", labels: ["backend", "infra"], storyPoints: 2, description: "Create GET /health endpoint that reports status of KV, Queue, and external API connectivity (Jira, Confluence, LLM provider)." },
    { summary: "Automate Wrangler deployment via GitHub Actions", issueType: "Task", priority: "Medium", labels: ["infra"], storyPoints: 3, description: "Set up CI/CD pipeline that automatically deploys the Worker and web frontend on merge to main, with rollback capability." },

    // Performance
    { summary: "Implement response caching for Jira search results", issueType: "Story", priority: "Medium", labels: ["backend", "performance"], storyPoints: 5, description: "Cache frequently-used JQL search results with configurable TTL. Use Cloudflare Cache API or KV-based caching strategy." },
    { summary: "Optimize SSE streaming for token-by-token delivery", issueType: "Story", priority: "Medium", labels: ["backend", "performance"], storyPoints: 3, description: "Current SSE implementation buffers tokens. Switch to immediate flush per token for a smoother streaming experience." },
    { summary: "Frontend bundle size exceeds 500KB gzipped", issueType: "Bug", priority: "Medium", labels: ["frontend", "performance"], storyPoints: 3, description: "The production bundle has grown to 520KB gzipped. Audit dependencies, implement code splitting, and lazy-load non-critical components." },
    { summary: "Add request deduplication for concurrent API calls", issueType: "Story", priority: "Low", labels: ["frontend", "performance"], storyPoints: 3, description: "Multiple components sometimes trigger the same API call simultaneously. Implement a request deduplication layer in the API client." },
    { summary: "Memory leak in SSE event listener on long conversations", issueType: "Bug", priority: "High", labels: ["frontend", "performance"], storyPoints: 5, description: "Browser memory usage grows unbounded during long chat sessions. SSE event listeners and message DOM nodes are not being properly cleaned up." },

    // AI Agent System
    { summary: "Add Confluence agent for document summarization", issueType: "Story", priority: "High", labels: ["backend", "api"], storyPoints: 8, description: "Create a new specialist agent that can summarize Confluence pages, compare document versions, and extract action items from meeting notes." },
    { summary: "Implement agent conversation memory across sessions", issueType: "Story", priority: "Medium", labels: ["backend"], storyPoints: 8, description: "Allow agents to remember context from previous conversations. Store key facts and preferences in a user-scoped memory KV namespace." },
    { summary: "Orchestrator sometimes delegates to wrong specialist", issueType: "Bug", priority: "High", labels: ["backend"], storyPoints: 5, description: "The orchestrator occasionally routes Confluence-related queries to the Jira agent. Improve system prompt and add routing heuristics." },
    { summary: "Add tool call retry logic with exponential backoff", issueType: "Story", priority: "Medium", labels: ["backend"], storyPoints: 3, description: "When a tool call fails due to transient errors (rate limits, timeouts), automatically retry with exponential backoff up to 3 attempts." },
    { summary: "Agent runner exceeds max iterations on complex queries", issueType: "Bug", priority: "Medium", labels: ["backend"], storyPoints: 3, description: "Some multi-step queries hit the 10-iteration limit without completing. Need to either increase the limit or optimize tool usage." },

    // Documentation & Onboarding
    { summary: "Create API documentation with interactive examples", issueType: "Task", priority: "Medium", labels: ["documentation", "api"], storyPoints: 5, description: "Write comprehensive API docs with curl examples, request/response schemas, and an interactive API explorer page." },
    { summary: "Add onboarding wizard for first-time users", issueType: "Story", priority: "Medium", labels: ["frontend", "ux"], storyPoints: 8, description: "Create a step-by-step onboarding flow: connect Atlassian, select project, try a sample query, and learn about slash commands." },
    { summary: "Update README with local development setup guide", issueType: "Task", priority: "Low", labels: ["documentation"], storyPoints: 2, description: "The README is outdated. Add instructions for setting up .dev.vars, running the monorepo, and configuring Atlassian OAuth for local dev." },
    { summary: "In-app help tooltips not showing on first visit", issueType: "Bug", priority: "Low", labels: ["frontend", "ux"], storyPoints: 1, description: "The contextual help tooltips that should appear on first visit are not triggering. The localStorage flag check has a race condition." },
  ];

  return issues;
}

function generateConfluencePages(): DemoPage[] {
  return [
    {
      title: "Product Roadmap Q2 2026",
      body: `<h1>Product Roadmap Q2 2026</h1>
<h2>Vision</h2>
<p>Deliver an AI-powered planning platform that reduces sprint planning time by 60% while improving estimation accuracy.</p>
<h2>Key Initiatives</h2>
<ul>
<li><strong>AI Agent Improvements</strong> - Enhanced multi-agent orchestration with memory and learning capabilities</li>
<li><strong>Enterprise SSO</strong> - SAML 2.0 and OIDC support for enterprise customers</li>
<li><strong>Advanced Analytics</strong> - Predictive sprint metrics and team velocity forecasting</li>
<li><strong>Mobile Experience</strong> - Responsive redesign and progressive web app support</li>
</ul>
<h2>Timeline</h2>
<table><tr><th>Month</th><th>Milestone</th></tr>
<tr><td>April</td><td>SSO beta launch, Analytics dashboard v2</td></tr>
<tr><td>May</td><td>Agent memory system, Mobile responsive redesign</td></tr>
<tr><td>June</td><td>Public API v1, Enterprise onboarding flow</td></tr></table>`,
    },
    {
      title: "Architecture Decision Record: Multi-Agent System",
      body: `<h1>ADR-007: Multi-Agent Architecture</h1>
<h2>Status</h2><p>Accepted</p>
<h2>Context</h2>
<p>As our AI assistant grew in capabilities, a single-agent approach became unwieldy. The system prompt exceeded 8K tokens and tool routing became error-prone.</p>
<h2>Decision</h2>
<p>We adopt a multi-agent architecture with an orchestrator pattern:</p>
<ul>
<li>An <strong>Orchestrator</strong> agent receives user messages and delegates to specialist agents</li>
<li><strong>Specialist agents</strong> (Jira, Confluence, Planning, Reporting) each have focused tool sets and system prompts</li>
<li>A shared <strong>Runner</strong> executes the agentic loop with a max iteration cap</li>
</ul>
<h2>Consequences</h2>
<p>Positive: Better separation of concerns, easier to add new specialists, more focused tool sets.<br/>
Negative: Added latency from orchestrator routing, potential for mis-delegation, more complex debugging.</p>`,
    },
    {
      title: "Sprint Retrospective - Sprint 24",
      body: `<h1>Sprint 24 Retrospective</h1>
<h2>What Went Well</h2>
<ul>
<li>Shipped Atlassian OAuth integration ahead of schedule</li>
<li>Zero production incidents this sprint</li>
<li>New team member Carol onboarded smoothly with good documentation</li>
</ul>
<h2>What Could Be Improved</h2>
<ul>
<li>Code review turnaround time averaged 2 days - aim for same-day</li>
<li>Two stories were under-estimated by 50%+ - need better spike process</li>
<li>Flaky CI tests wasted ~4 hours of developer time</li>
</ul>
<h2>Action Items</h2>
<ul>
<li><strong>Dave</strong>: Set up Slack reminders for pending reviews</li>
<li><strong>Alice</strong>: Investigate and fix flaky CI tests by next sprint</li>
<li><strong>Team</strong>: Add estimation confidence level to sprint planning</li>
</ul>`,
    },
    {
      title: "API Design Guidelines",
      body: `<h1>API Design Guidelines</h1>
<h2>REST Conventions</h2>
<ul>
<li>Use kebab-case for URL paths: <code>/api/chat-conversations</code></li>
<li>Use camelCase for JSON properties: <code>{ "conversationId": "..." }</code></li>
<li>Return appropriate HTTP status codes: 200, 201, 400, 401, 403, 404, 500</li>
<li>Include pagination for list endpoints: <code>?limit=20&offset=0</code></li>
</ul>
<h2>Authentication</h2>
<p>All API endpoints require JWT bearer token authentication except public routes (login, OAuth callback).</p>
<h2>Error Responses</h2>
<p>Always return JSON error objects:</p>
<pre><code>{ "error": "Human-readable message", "code": "MACHINE_CODE" }</code></pre>
<h2>Rate Limiting</h2>
<p>Public API: 100 requests/minute per API key. Internal: 1000 requests/minute per user session.</p>`,
    },
    {
      title: "Team Onboarding Guide",
      body: `<h1>New Team Member Onboarding</h1>
<h2>Week 1: Setup & Orientation</h2>
<ul>
<li>Clone the monorepo and run <code>bun install</code></li>
<li>Copy <code>.dev.vars.example</code> to <code>.dev.vars</code> and fill in credentials</li>
<li>Run <code>npm run dev</code> and <code>npm run dev:web</code> to start local development</li>
<li>Connect your Atlassian account via the app's sidebar button</li>
</ul>
<h2>Week 2: First Contribution</h2>
<ul>
<li>Pick a "good first issue" from the Jira board</li>
<li>Create a feature branch and submit a PR</li>
<li>Pair with a team member on code review</li>
</ul>
<h2>Key Contacts</h2>
<table><tr><th>Area</th><th>Contact</th></tr>
<tr><td>Architecture</td><td>Alice Chen</td></tr>
<tr><td>Frontend</td><td>Grace Wang</td></tr>
<tr><td>DevOps/Infra</td><td>Frank Lee</td></tr>
<tr><td>Product</td><td>Eve Johnson</td></tr></table>`,
    },
    {
      title: "Security & Compliance Checklist",
      body: `<h1>Security & Compliance Checklist</h1>
<h2>Authentication & Authorization</h2>
<ul>
<li>✅ JWT tokens with HS256 signing and 24-hour expiry</li>
<li>✅ CSRF protection via nonce verification on OAuth flows</li>
<li>✅ Per-user OAuth token isolation in KV storage</li>
<li>⬜ Implement rate limiting on login endpoint</li>
<li>⬜ Add IP-based brute force protection</li>
</ul>
<h2>Data Protection</h2>
<ul>
<li>✅ Atlassian tokens encrypted at rest in KV</li>
<li>✅ No sensitive data in client-side localStorage (only JWT)</li>
<li>⬜ Implement data retention policy (auto-delete after 90 days)</li>
<li>⬜ Add audit logging for admin actions</li>
</ul>
<h2>Infrastructure</h2>
<ul>
<li>✅ HTTPS enforced via Cloudflare</li>
<li>✅ CORS headers configured</li>
<li>⬜ Set up WAF rules for API protection</li>
<li>⬜ Enable Cloudflare Access for staging environment</li>
</ul>`,
    },
    {
      title: "Sprint Planning Template",
      body: `<h1>Sprint Planning Template</h1>
<h2>Sprint Goals</h2>
<p>Define 2-3 measurable sprint goals that align with quarterly OKRs.</p>
<h2>Capacity Planning</h2>
<table><tr><th>Team Member</th><th>Available Days</th><th>Focus Area</th></tr>
<tr><td>Alice Chen</td><td>9</td><td>Backend/Architecture</td></tr>
<tr><td>Bob Martinez</td><td>8</td><td>Full-stack</td></tr>
<tr><td>Carol Smith</td><td>10</td><td>Frontend</td></tr>
<tr><td>Dave Kim</td><td>7</td><td>DevOps/Testing</td></tr></table>
<h2>Sprint Backlog Selection Criteria</h2>
<ol>
<li>Priority alignment with product roadmap</li>
<li>Dependencies resolved or resolvable within sprint</li>
<li>Estimation confidence ≥ 70%</li>
<li>Total story points ≤ team velocity average (42 points)</li>
</ol>`,
    },
    {
      title: "Incident Report: Production Outage 2026-02-28",
      body: `<h1>Incident Report: Production SSE Streaming Failure</h1>
<h2>Summary</h2>
<p>On February 28, 2026 from 14:22 to 15:47 UTC, the chat streaming endpoint returned 502 errors for all users.</p>
<h2>Root Cause</h2>
<p>A Cloudflare Worker CPU time limit was exceeded due to an infinite loop in the agent runner when the LLM returned malformed tool call JSON. The runner retried parsing indefinitely instead of failing after max iterations.</p>
<h2>Impact</h2>
<ul>
<li>85 minutes of complete service unavailability</li>
<li>23 active users affected</li>
<li>No data loss</li>
</ul>
<h2>Resolution</h2>
<p>Deployed hotfix adding JSON parse error handling and ensuring the max iteration guard applies to all loop paths.</p>
<h2>Follow-up Actions</h2>
<ul>
<li>Add alerting for elevated 502 rates</li>
<li>Implement circuit breaker for LLM API calls</li>
<li>Add synthetic monitoring for the chat endpoint</li>
</ul>`,
    },
    {
      title: "Database Schema Documentation",
      body: `<h1>Database Schema Documentation</h1>
<h2>KV Namespace: PLANBOT_CHAT</h2>
<p>Stores chat conversation history. Key format: <code>conversation:{userId}:{conversationId}</code></p>
<h3>Conversation Object</h3>
<pre><code>{
  "id": "uuid",
  "userId": "sha256-hash",
  "title": "Conversation title",
  "messages": [...],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}</code></pre>
<h2>KV Namespace: PLANBOT_CONFIG</h2>
<p>Stores OAuth tokens and configuration.</p>
<h3>Key Patterns</h3>
<table><tr><th>Key</th><th>Value</th><th>TTL</th></tr>
<tr><td>atlassian_token:{userId}</td><td>AtlassianTokenData JSON</td><td>None (refreshed)</td></tr>
<tr><td>atlassian_nonce:{nonce}</td><td>userId</td><td>600s</td></tr>
<tr><td>team_config:{name}</td><td>TeamCapacity JSON</td><td>None</td></tr></table>`,
    },
    {
      title: "Release Notes v1.5.0",
      body: `<h1>Release Notes - PlanBot v1.5.0</h1>
<p><em>Released: March 5, 2026</em></p>
<h2>New Features</h2>
<ul>
<li><strong>Multi-Agent Chat</strong>: PlanBot now uses specialized AI agents for Jira, Confluence, and planning tasks, with an orchestrator that routes queries intelligently.</li>
<li><strong>@-Mention Support</strong>: Reference Jira issues and Confluence pages directly in chat with <code>@jira:KEY-123</code> or paste a Confluence URL.</li>
<li><strong>Conversation History</strong>: All chat conversations are saved and searchable from the sidebar.</li>
</ul>
<h2>Improvements</h2>
<ul>
<li>Reduced average response time by 40% through streaming optimizations</li>
<li>Improved Jira search accuracy with enhanced JQL generation</li>
<li>Added token usage display in chat header</li>
</ul>
<h2>Bug Fixes</h2>
<ul>
<li>Fixed OAuth callback redirect in development mode</li>
<li>Fixed crash when Jira issues have null status fields</li>
<li>Fixed cursor pagination for large Jira search results</li>
</ul>`,
    },
    {
      title: "Performance Benchmarks Q1 2026",
      body: `<h1>Performance Benchmarks - Q1 2026</h1>
<h2>API Response Times (p50 / p95 / p99)</h2>
<table><tr><th>Endpoint</th><th>p50</th><th>p95</th><th>p99</th></tr>
<tr><td>POST /api/chat (TTFB)</td><td>280ms</td><td>850ms</td><td>1.4s</td></tr>
<tr><td>GET /api/search</td><td>120ms</td><td>340ms</td><td>680ms</td></tr>
<tr><td>GET /api/chat/conversations</td><td>45ms</td><td>95ms</td><td>180ms</td></tr>
<tr><td>POST /api/auth/login</td><td>35ms</td><td>72ms</td><td>110ms</td></tr></table>
<h2>Frontend Metrics</h2>
<ul>
<li>First Contentful Paint: 0.8s</li>
<li>Time to Interactive: 1.2s</li>
<li>Bundle Size (gzipped): 487KB</li>
<li>Lighthouse Score: 92/100</li>
</ul>
<h2>Targets for Q2</h2>
<ul>
<li>Chat TTFB p95 < 500ms</li>
<li>Bundle size < 400KB gzipped</li>
<li>Lighthouse score > 95</li>
</ul>`,
    },
    {
      title: "Cloudflare Workers Architecture Guide",
      body: `<h1>Cloudflare Workers Architecture Guide</h1>
<h2>Overview</h2>
<p>PlanBot runs entirely on Cloudflare's edge network using Workers, KV, and Queues.</p>
<h2>Request Flow</h2>
<ol>
<li>Request hits Cloudflare edge → Worker <code>fetch</code> handler</li>
<li>Router matches path and extracts JWT auth</li>
<li>Handler processes request (chat, search, auth, etc.)</li>
<li>For chat: SSE stream with orchestrator → agent → tool calls</li>
<li>Conversation persisted to KV on completion</li>
</ol>
<h2>Limits & Constraints</h2>
<ul>
<li>CPU time: 30s (paid plan) — affects long agent conversations</li>
<li>KV value size: 25MB max — conversations must be bounded</li>
<li>Subrequest limit: 1000 per request — relevant for multi-tool agent runs</li>
<li>No native WebSocket in Workers (use Durable Objects for persistent connections)</li>
</ul>
<h2>Best Practices</h2>
<ul>
<li>Keep imports minimal to reduce cold start time</li>
<li>Use streaming responses for long-running operations</li>
<li>Implement graceful degradation when external APIs are slow</li>
</ul>`,
    },
    {
      title: "Testing Strategy & Standards",
      body: `<h1>Testing Strategy & Standards</h1>
<h2>Test Pyramid</h2>
<ul>
<li><strong>Unit Tests</strong> (70%): Individual functions, utilities, type validations</li>
<li><strong>Integration Tests</strong> (20%): API routes, agent tool execution, KV operations</li>
<li><strong>E2E Tests</strong> (10%): Critical user flows via Playwright</li>
</ul>
<h2>Tools</h2>
<ul>
<li>Test runner: <strong>Vitest</strong> (fast, ESM-native, Workers-compatible)</li>
<li>E2E: <strong>Playwright</strong> (planned, not yet configured)</li>
<li>Coverage: <strong>v8</strong> via Vitest (target: 80% for worker package)</li>
</ul>
<h2>Conventions</h2>
<ul>
<li>Test files: <code>*.test.ts</code> co-located with source</li>
<li>Describe blocks mirror module structure</li>
<li>Use <code>vi.mock()</code> for external dependencies (LLM, Atlassian API)</li>
<li>Snapshot tests for SSE event sequences</li>
</ul>
<h2>CI Integration</h2>
<p>Tests run on every PR via GitHub Actions. PRs cannot merge with failing tests or coverage below threshold.</p>`,
    },
    {
      title: "Competitive Analysis: AI Planning Tools",
      body: `<h1>Competitive Analysis: AI Planning Tools</h1>
<h2>Market Overview</h2>
<p>The AI-powered project planning space is growing rapidly with several players:</p>
<table><tr><th>Tool</th><th>Strength</th><th>Weakness</th></tr>
<tr><td>Linear AI</td><td>Beautiful UI, fast</td><td>Limited planning depth</td></tr>
<tr><td>Jira AI (Atlassian Intelligence)</td><td>Native integration</td><td>Generic suggestions</td></tr>
<tr><td>Shortcut AI</td><td>Good estimation</td><td>Small ecosystem</td></tr>
<tr><td>PlanBot (us)</td><td>Deep Jira/Confluence context, multi-agent</td><td>Early stage, limited integrations</td></tr></table>
<h2>Our Differentiators</h2>
<ul>
<li><strong>Context-aware planning</strong>: We pull in Jira issues, Confluence docs, team capacity, and historical data</li>
<li><strong>Multi-agent architecture</strong>: Specialized agents provide deeper expertise than single-model approaches</li>
<li><strong>Conversation-based</strong>: Natural language interaction vs. rigid forms</li>
</ul>`,
    },
    {
      title: "Quarterly OKRs - Q2 2026",
      body: `<h1>Quarterly OKRs - Q2 2026</h1>
<h2>Objective 1: Increase User Engagement</h2>
<ul>
<li><strong>KR1</strong>: Increase daily active users from 23 to 100</li>
<li><strong>KR2</strong>: Average session duration > 15 minutes</li>
<li><strong>KR3</strong>: User retention (week 4) > 60%</li>
</ul>
<h2>Objective 2: Improve AI Planning Quality</h2>
<ul>
<li><strong>KR1</strong>: Planning accuracy score > 85% (user-rated)</li>
<li><strong>KR2</strong>: Reduce average planning response time to < 10 seconds</li>
<li><strong>KR3</strong>: Support 3+ planning modes (sprint, release, capacity)</li>
</ul>
<h2>Objective 3: Enterprise Readiness</h2>
<ul>
<li><strong>KR1</strong>: Ship SSO with SAML 2.0 support</li>
<li><strong>KR2</strong>: Pass security audit with zero critical findings</li>
<li><strong>KR3</strong>: 99.9% uptime SLA for paid tier</li>
</ul>
<h2>Team Allocation</h2>
<p>40% AI/Agent improvements, 30% Enterprise features, 20% UX/Performance, 10% Tech debt</p>`,
    },
  ];
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEvent(type: string, data: unknown): string {
  return `data: ${JSON.stringify({ type, data })}\n\n`;
}

// ---------------------------------------------------------------------------
// Atlassian API helpers for creating content
// ---------------------------------------------------------------------------

async function getJiraProjectId(
  projectKey: string,
  auth: { accessToken: string; cloudId: string },
): Promise<string> {
  const url = `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/api/3/project/${projectKey}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to get project ${projectKey}: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function getIssueTypeIds(
  projectKey: string,
  auth: { accessToken: string; cloudId: string },
): Promise<Record<string, string>> {
  const url = `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/api/3/issue/createmeta/${projectKey}/issuetypes`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    // Fallback: try project endpoint
    const fallbackUrl = `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/api/3/project/${projectKey}`;
    const fallbackRes = await fetch(fallbackUrl, {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
      },
    });
    if (!fallbackRes.ok) {
      throw new Error(`Failed to get issue types: ${res.status}`);
    }
    const project = (await fallbackRes.json()) as { issueTypes: { id: string; name: string }[] };
    const map: Record<string, string> = {};
    for (const it of project.issueTypes ?? []) {
      map[it.name] = it.id;
    }
    return map;
  }
  const data = (await res.json()) as { issueTypes?: { id: string; name: string }[]; values?: { id: string; name: string }[] };
  const types = data.issueTypes ?? data.values ?? [];
  const map: Record<string, string> = {};
  for (const it of types) {
    map[it.name] = it.id;
  }
  return map;
}

async function createJiraIssue(
  projectKey: string,
  issue: DemoIssue,
  issueTypeIds: Record<string, string>,
  auth: { accessToken: string; cloudId: string },
): Promise<{ key: string }> {
  // Find best matching issue type ID
  let issueTypeId = issueTypeIds[issue.issueType];
  if (!issueTypeId) {
    // Fallback to Task or first available
    issueTypeId = issueTypeIds["Task"] ?? issueTypeIds["Story"] ?? Object.values(issueTypeIds)[0];
  }

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    summary: issue.summary,
    issuetype: { id: issueTypeId },
    description: {
      version: 1,
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: issue.description }],
        },
      ],
    },
    labels: issue.labels,
  };

  // Try with story points first, retry without if field is unavailable
  if (issue.storyPoints !== null) {
    fields["customfield_10016"] = issue.storyPoints;
  }

  const url = `https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/api/3/issue`;
  let res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  // If story points field is not available, retry without it
  if (!res.ok && issue.storyPoints !== null) {
    const errText = await res.text();
    if (errText.includes("customfield_10016")) {
      delete fields["customfield_10016"];
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ fields }),
      });
    } else {
      throw new Error(`Failed to create Jira issue: ${res.status} ${errText}`);
    }
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create Jira issue: ${res.status} ${errText}`);
  }

  return (await res.json()) as { key: string };
}

async function getConfluenceSpaces(
  auth: { accessToken: string; cloudId: string },
): Promise<{ key: string; id: string; name: string }[]> {
  // Use v2 API (works with read:space:confluence granular scope)
  const url = `https://api.atlassian.com/ex/confluence/${auth.cloudId}/wiki/api/v2/spaces?limit=10`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to get Confluence spaces: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as { results: { key: string; id: string; name: string }[] };
  if (data.results.length === 0) {
    throw new Error("No Confluence spaces found. Please create a space first.");
  }
  return data.results;
}

async function createConfluencePage(
  spaceId: string,
  page: DemoPage,
  auth: { accessToken: string; cloudId: string },
): Promise<{ id: string; title: string }> {
  // Use v2 API (v1 content endpoint has been removed)
  const url = `https://api.atlassian.com/ex/confluence/${auth.cloudId}/wiki/api/v2/pages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      spaceId,
      status: "current",
      title: page.title,
      body: {
        representation: "storage",
        value: page.body,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create Confluence page: ${res.status} ${errText}`);
  }

  return (await res.json()) as { id: string; title: string };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleDemoGenerate(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  // Parse optional config from body
  let projectKey = "KAN";
  let spaceId: string | null = null;
  let enableJira = true;
  let enableConfluence = true;
  try {
    const body = (await request.json()) as {
      projectKey?: string;
      spaceId?: string;
      jira?: boolean;
      confluence?: boolean;
    };
    if (body.projectKey) projectKey = body.projectKey;
    if (body.spaceId) spaceId = body.spaceId;
    if (typeof body.jira === "boolean") enableJira = body.jira;
    if (typeof body.confluence === "boolean") enableConfluence = body.confluence;
  } catch {
    // Use defaults
  }

  const jiraCount = enableJira ? 50 : 0;
  const confluenceCount = enableConfluence ? 15 : 0;
  const totalSteps = 1 + (enableJira ? 1 + jiraCount : 0) + (enableConfluence ? 1 + confluenceCount : 0);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let currentStep = 0;
      function send(type: string, data: unknown) {
        controller.enqueue(encoder.encode(sseEvent(type, data)));
      }

      try {
        // Get Atlassian auth
        send("progress", { message: "Connecting to Atlassian...", step: currentStep++, total: totalSteps });
        const auth = await getAtlassianAccessToken(userId, env);

        const createdIssues: string[] = [];
        const createdPages: string[] = [];

        // --- Jira ---
        if (enableJira) {
          send("progress", { message: `Fetching project ${projectKey} metadata...`, step: currentStep++, total: totalSteps });
          const issueTypeIds = await getIssueTypeIds(projectKey, auth);

          const issues = generateJiraIssues();
          for (let i = 0; i < issues.length; i++) {
            const issue = issues[i];
            try {
              send("progress", {
                message: `Creating Jira issue ${i + 1}/50: ${issue.summary.slice(0, 50)}...`,
                step: currentStep++,
                total: totalSteps,
              });
              const created = await createJiraIssue(projectKey, issue, issueTypeIds, auth);
              createdIssues.push(created.key);
              send("issue_created", { key: created.key, summary: issue.summary, index: i + 1 });
            } catch (err) {
              currentStep = Math.min(currentStep, totalSteps);
              send("issue_error", {
                summary: issue.summary,
                error: err instanceof Error ? err.message : String(err),
                index: i + 1,
              });
            }
          }
        }

        // --- Confluence ---
        if (enableConfluence) {
          if (!spaceId) {
            send("progress", { message: "Discovering Confluence spaces...", step: currentStep++, total: totalSteps });
            const spaces = await getConfluenceSpaces(auth);
            if (spaces.length === 0) {
              throw new Error("No Confluence spaces found. Please create a space first.");
            }
            spaceId = spaces[0].id;
            send("progress", { message: `Using Confluence space: ${spaces[0].name || spaces[0].key} (${spaceId})`, step: currentStep, total: totalSteps });
          } else {
            currentStep++;
          }

          const pages = generateConfluencePages();
          for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            try {
              send("progress", {
                message: `Creating Confluence page ${i + 1}/15: ${page.title.slice(0, 50)}...`,
                step: currentStep++,
                total: totalSteps,
              });
              const created = await createConfluencePage(spaceId!, page, auth);
              createdPages.push(created.id);
              send("page_created", { id: created.id, title: page.title, index: i + 1 });
            } catch (err) {
              currentStep = Math.min(currentStep, totalSteps);
              send("page_error", {
                title: page.title,
                error: err instanceof Error ? err.message : String(err),
                index: i + 1,
              });
            }
          }
        }

        // Done
        send("done", {
          jiraIssuesCreated: createdIssues.length,
          confluencePagesCreated: createdPages.length,
          jiraKeys: createdIssues,
          projectKey,
          spaceId,
        });
      } catch (err) {
        send("error", {
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
