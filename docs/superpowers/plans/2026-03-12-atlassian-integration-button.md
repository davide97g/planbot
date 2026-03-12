# Atlassian Integration Button Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Atlassian OAuth connect/disconnect button to the sidebar footer so users can link their Atlassian account from the chat UI.

**Architecture:** The backend gains a `disconnectAtlassian` helper and `handleAtlassianConnect` is changed to return `{ url }` JSON instead of a 302 redirect (so the frontend can call it with a Bearer token). A new `useAtlassianStatus` hook polls connection status and exposes `connect`/`disconnect` actions. The button renders in `ConversationSidebar` footer, wired through `ChatContainer`.

**Tech Stack:** Cloudflare Workers (TypeScript), React + shadcn/ui + Tailwind + lucide-react, Vitest (backend tests only)

---

## Chunk 1: Backend changes

### Task 1: Add `disconnectAtlassian` and change `handleAtlassianConnect` to return JSON

**Files:**
- Modify: `packages/worker/src/api/atlassian-oauth.ts`
- Create: `packages/worker/src/__tests__/atlassian-oauth.test.ts`

- [ ] **Step 1: Create the test file with failing tests**

Create `packages/worker/src/__tests__/atlassian-oauth.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleAtlassianConnect, disconnectAtlassian } from "../api/atlassian-oauth";

const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockEnv = {
  PLANBOT_CONFIG: mockKV,
  ATLASSIAN_CLIENT_ID: "test-client-id",
  ATLASSIAN_CLIENT_SECRET: "test-client-secret",
  ATLASSIAN_REDIRECT_URI: "https://example.com/api/auth/atlassian/callback",
} as any;

beforeEach(() => {
  vi.restoreAllMocks();
  mockKV.put.mockResolvedValue(undefined);
  mockKV.delete.mockResolvedValue(undefined);
});

describe("handleAtlassianConnect", () => {
  it("returns JSON with an Atlassian authorize URL", async () => {
    const request = new Request("https://example.com/api/auth/atlassian/connect");
    const response = await handleAtlassianConnect(request, mockEnv, "user-123");

    expect(response.status).toBe(200);
    const body = await response.json() as { url: string };
    expect(body.url).toContain("https://auth.atlassian.com/authorize");
    expect(body.url).toContain("client_id=test-client-id");
    expect(body.url).toContain("response_type=code");
    expect(body.url).toContain("offline_access");
  });

  it("stores the CSRF nonce in KV before returning", async () => {
    const request = new Request("https://example.com/api/auth/atlassian/connect");
    await handleAtlassianConnect(request, mockEnv, "user-123");

    expect(mockKV.put).toHaveBeenCalledOnce();
    const [key, value, opts] = mockKV.put.mock.calls[0];
    expect(key).toMatch(/^atlassian_nonce:/);
    expect(value).toBe("user-123");
    expect(opts).toEqual({ expirationTtl: 600 });
  });

  it("encodes the userId in the state param", async () => {
    const request = new Request("https://example.com/api/auth/atlassian/connect");
    const response = await handleAtlassianConnect(request, mockEnv, "user-abc");

    const body = await response.json() as { url: string };
    const url = new URL(body.url);
    const state = JSON.parse(atob(url.searchParams.get("state")!));
    expect(state.userId).toBe("user-abc");
    expect(state.nonce).toBeTruthy();
  });
});

describe("disconnectAtlassian", () => {
  it("deletes the token KV entry for the user", async () => {
    await disconnectAtlassian("user-123", mockEnv);

    expect(mockKV.delete).toHaveBeenCalledOnce();
    expect(mockKV.delete).toHaveBeenCalledWith("atlassian_token:user-123");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/worker && bunx vitest run src/__tests__/atlassian-oauth.test.ts 2>&1 | tail -10
```

Expected: tests fail — `disconnectAtlassian` is not exported, and `handleAtlassianConnect` currently returns a 302.

- [ ] **Step 3: Update `handleAtlassianConnect` to return JSON**

In `packages/worker/src/api/atlassian-oauth.ts`, change the last line of `handleAtlassianConnect` (currently `return Response.redirect(authUrl.toString(), 302);`) to:

```typescript
  return Response.json({ url: authUrl.toString() });
```

- [ ] **Step 4: Add `disconnectAtlassian` export**

In `packages/worker/src/api/atlassian-oauth.ts`, append after the closing brace of `hasAtlassianToken`:

```typescript
/**
 * Removes the stored Atlassian token for a user.
 * Called by the DELETE /api/auth/atlassian/token route in router.ts.
 */
export async function disconnectAtlassian(userId: string, env: Env): Promise<void> {
  await env.PLANBOT_CONFIG.delete(kvKey(userId));
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/worker && bunx vitest run src/__tests__/atlassian-oauth.test.ts 2>&1 | tail -10
```

Expected: 4 tests pass, 0 failures.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
cd packages/worker && bunx vitest run 2>&1 | tail -5
```

Expected: 41 passed (37 existing + 4 new), 0 failures.

- [ ] **Step 7: Commit**

```bash
git add packages/worker/src/api/atlassian-oauth.ts packages/worker/src/__tests__/atlassian-oauth.test.ts
git commit -m "feat: return JSON url from handleAtlassianConnect; add disconnectAtlassian"
```

---

### Task 2: Add `DELETE /api/auth/atlassian/token` route to router

**Files:**
- Modify: `packages/worker/src/api/router.ts`

- [ ] **Step 1: Add `disconnectAtlassian` to the import**

In `packages/worker/src/api/router.ts`, find the existing import from `./atlassian-oauth` (currently imports `handleAtlassianConnect, handleAtlassianCallback, hasAtlassianToken, getAtlassianAccessToken`) and add `disconnectAtlassian`:

```typescript
import {
  handleAtlassianConnect,
  handleAtlassianCallback,
  hasAtlassianToken,
  getAtlassianAccessToken,
  disconnectAtlassian,
} from "./atlassian-oauth";
```

- [ ] **Step 2: Update the stale comment on the connect route**

In `packages/worker/src/api/router.ts`, find the comment above the connect route (around line 381) and update it:

```typescript
    // GET /api/auth/atlassian/connect — returns { url } JSON for frontend to navigate to
```

- [ ] **Step 3: Add the DELETE route**

In `packages/worker/src/api/router.ts`, directly after the `GET /api/auth/atlassian/status` block (around line 389) and before `POST /api/chat`, add:

```typescript
    // DELETE /api/auth/atlassian/token — disconnect Atlassian
    if (path === "/api/auth/atlassian/token" && method === "DELETE") {
      await disconnectAtlassian(userId, env);
      return corsJson({ ok: true });
    }
```

- [ ] **Step 4: Run full test suite**

```bash
cd packages/worker && bunx vitest run 2>&1 | tail -5
```

Expected: 41 passed, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add packages/worker/src/api/router.ts
git commit -m "feat: add DELETE /api/auth/atlassian/token route for disconnect"
```

---

## Chunk 2: Frontend changes

### Task 3: Create `useAtlassianStatus` hook

**Files:**
- Create: `packages/web/src/hooks/useAtlassianStatus.ts`

- [ ] **Step 1: Create the hook file**

Create `packages/web/src/hooks/useAtlassianStatus.ts`:

```typescript
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface AtlassianStatus {
  connected: boolean;
  loading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useAtlassianStatus(): AtlassianStatus {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/auth/atlassian/status")
      .then((res) => {
        if (res.ok) return res.json() as Promise<{ connected: boolean }>;
        return { connected: false };
      })
      .then((data) => setConnected(data.connected))
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, []);

  async function connect(): Promise<void> {
    setError(null);
    try {
      const res = await apiFetch("/api/auth/atlassian/connect");
      if (!res.ok) {
        setError("Failed to connect. Try again.");
        return;
      }
      const { url } = await res.json() as { url: string };
      window.location.href = url;
    } catch {
      setError("Failed to connect. Try again.");
    }
  }

  async function disconnect(): Promise<void> {
    setError(null);
    try {
      const res = await apiFetch("/api/auth/atlassian/token", { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to disconnect. Try again.");
        return;
      }
      setConnected(false);
    } catch {
      setError("Failed to disconnect. Try again.");
    }
  }

  return { connected, loading, error, connect, disconnect };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `useAtlassianStatus.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/hooks/useAtlassianStatus.ts
git commit -m "feat: add useAtlassianStatus hook"
```

---

### Task 4: Add Atlassian button to `ConversationSidebar`

**Files:**
- Modify: `packages/web/src/components/ConversationSidebar.tsx`

- [ ] **Step 1: Add imports**

At the top of `packages/web/src/components/ConversationSidebar.tsx`:

1. Add `Loader2Icon` to the existing lucide-react import line (which currently imports `PlusIcon, Trash2Icon, PencilIcon, MessageSquareIcon, PanelLeftCloseIcon, LogOutIcon`):

```typescript
import {
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  MessageSquareIcon,
  PanelLeftCloseIcon,
  LogOutIcon,
  Loader2Icon,
} from "lucide-react";
```

2. Add after the existing imports:

```typescript
import type { AtlassianStatus } from "@/hooks/useAtlassianStatus";
```

- [ ] **Step 2: Add `atlassianStatus` to `ConversationSidebarProps`**

Find the `ConversationSidebarProps` interface and add the new prop:

```typescript
interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onCollapse: () => void;
  onLogout: () => void;
  atlassianStatus: AtlassianStatus;   // add this
}
```

- [ ] **Step 3: Destructure the new prop**

In the `ConversationSidebar` function signature, add `atlassianStatus` to the destructured props:

```typescript
export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onCollapse,
  onLogout,
  atlassianStatus,  // add this
}: ConversationSidebarProps) {
```

- [ ] **Step 4: Add the inline `AtlassianButton` component and the Atlassian icon**

Add this before the `ConversationSidebar` function (after the imports and `formatRelativeTime` helper):

```typescript
const AtlassianIcon = ({ className }: { className?: string }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005z" />
    <path d="M6.016 6.28H17.58a5.218 5.218 0 0 0-5.232-5.215h-2.13V1.008A5.215 5.215 0 0 0 5.012 6.22v.06" />
  </svg>
);

function AtlassianButton({ status }: { status: AtlassianStatus }) {
  if (status.loading) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-muted-foreground"
        size="sm"
        disabled
      >
        <Loader2Icon className="size-4 animate-spin opacity-50" />
        Atlassian…
      </Button>
    );
  }

  if (status.error) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-destructive"
        size="sm"
        onClick={status.connected ? status.disconnect : status.connect}
      >
        <AtlassianIcon className="size-4" />
        {status.error}
      </Button>
    );
  }

  if (status.connected) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start gap-2 text-green-600 hover:text-red-600 hover:bg-red-50"
        size="sm"
        onClick={status.disconnect}
      >
        <AtlassianIcon className="size-4" />
        Atlassian connected
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start gap-2 text-muted-foreground border border-dashed"
      size="sm"
      onClick={status.connect}
    >
      <AtlassianIcon className="size-4" />
      Connect Atlassian
    </Button>
  );
}
```

- [ ] **Step 5: Render `AtlassianButton` in the footer**

In the sidebar footer section (the `<div className="p-3">` that contains the Sign out button), add `<AtlassianButton>` directly above the Sign out button:

```tsx
      {/* Footer with integrations and logout */}
      <Separator />
      <div className="p-3 flex flex-col gap-1">
        <AtlassianButton status={atlassianStatus} />
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          size="sm"
          onClick={() => {
            clearToken();
            onLogout();
          }}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </Button>
      </div>
```

Note: the outer `<div>` changes from `className="p-3"` to `className="p-3 flex flex-col gap-1"` to stack the two buttons cleanly.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd packages/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/components/ConversationSidebar.tsx
git commit -m "feat: add Atlassian integration button to sidebar footer"
```

---

### Task 5: Wire `useAtlassianStatus` through `ChatContainer`

**Files:**
- Modify: `packages/web/src/components/ChatContainer.tsx`

- [ ] **Step 1: Import the hook**

In `packages/web/src/components/ChatContainer.tsx`, add after the existing imports:

```typescript
import { useAtlassianStatus } from "@/hooks/useAtlassianStatus";
```

- [ ] **Step 2: Call the hook inside `ChatContainer`**

Inside the `ChatContainer` function body, after `const chat = useChat();`, add:

```typescript
  const atlassianStatus = useAtlassianStatus();
```

- [ ] **Step 3: Pass the status as a prop to `ConversationSidebar`**

Find the existing `<ConversationSidebar ... />` JSX inside `{sidebarOpen && (...)}` in `ChatContainer`. **Add only the new prop** — do not replace the whole block:

```tsx
          atlassianStatus={atlassianStatus}
```

The final `<ConversationSidebar>` should look like:

```tsx
        <ConversationSidebar
          conversations={chat.conversations}
          activeId={chat.conversationId}
          onSelect={(id) => chat.loadConversation(id)}
          onNew={chat.newConversation}
          onDelete={(id) => chat.deleteConversation(id)}
          onRename={(id, title) => chat.renameConversation(id, title)}
          onCollapse={() => setSidebarOpen(false)}
          onLogout={onLogout}
          atlassianStatus={atlassianStatus}
        />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd packages/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Run backend tests to confirm no regressions**

```bash
cd packages/worker && bunx vitest run 2>&1 | tail -5
```

Expected: 41 passed, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ChatContainer.tsx
git commit -m "feat: wire useAtlassianStatus into ChatContainer and sidebar"
```
