# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Package manager: Bun (bun.lock)
npm run dev           # Start worker backend (localhost:8787)
npm run dev:web       # Start Vite frontend dev server
npm run build:web     # Build React app
npm run test          # Run worker tests (Vitest)
npm run test:watch    # Watch mode tests
npm run deploy        # Deploy worker to Cloudflare
npm run deploy:web    # Deploy web frontend (builds first)
```

## Architecture

**Monorepo** with three workspace packages:

- **`packages/shared`** — Shared types (`types.ts`) and JSON Schema tool builders (`tool-schemas.ts`). Used by both worker and web.
- **`packages/worker`** — Cloudflare Worker backend. Entry point: `src/index.ts` (fetch + queue handlers). Routes in `src/api/router.ts`.
- **`packages/web`** — React 19 + Vite SPA. Tailwind CSS 4 + shadcn/ui. Path alias `@/` maps to `src/`.

### Agent System (worker)

Multi-agent LLM architecture with tool calling:

- **Orchestrator** (`agents/orchestrator.ts`) — Master agent that delegates to specialists
- **Specialists** — Planning, Jira, Confluence, Reporting agents (each with own tools + system prompt)
- **Runner** (`agents/runner.ts`) — Core agentic loop (max 10 iterations per agent)
- **LLM Provider** (`agents/llm-provider.ts`) — Supports OpenAI (gpt-4o) and Anthropic Claude, configured via `LLM_PROVIDER` env var
- **Tools** (`tools/`) — Modular tool definitions per agent, routed by name in `tools/index.ts`

### Chat System

- **SSE streaming** for real-time tokens, tool calls, and results (`api/chat.ts`)
- **Conversation storage** in Cloudflare KV (`chat/conversation.ts`)
- **@-mentions** resolve Jira issues and Confluence pages into context (`chat/mentions.ts`)
- **Slash commands** parsed in `chat/commands.ts`

### Auth & Integrations

- JWT auth with team password login (`api/auth.ts`)
- Atlassian OAuth 2.0 per-user tokens stored in KV under `auth:${userId}:atlassian` (`api/atlassian-oauth.ts`)
- Jira client: `src/jira.ts` — Confluence client: `src/confluence.ts`
- Legacy Slack bot integration via Cloudflare Queues (`src/slack.ts`, `src/consumer.ts`)

### Storage

- **`PLANBOT_CONFIG`** KV — OAuth tokens, team configuration
- **`PLANBOT_CHAT`** KV — Chat conversation history
- **`PLANBOT_QUEUE`** — Cloudflare Queue for async Slack job processing

## Environment

Copy `.dev.vars.example` to `.dev.vars` for local worker development. Frontend uses `VITE_API_URL` (defaults to `http://localhost:8787`).
