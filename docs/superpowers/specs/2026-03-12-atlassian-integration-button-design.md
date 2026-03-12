# Atlassian Integration Button

**Date:** 2026-03-12
**Status:** Approved

## Summary

Add an Atlassian OAuth connection button to the sidebar footer so users can connect or disconnect their Atlassian account directly from the chat UI. The button shows live connection status and triggers the OAuth flow or disconnects with a single click.

---

## Placement

The button lives in `ConversationSidebar` footer, above the existing "Sign out" button. It is hidden when the sidebar is collapsed (acceptable — the sidebar must be open to access account actions anyway).

---

## Interaction model

**Direct action — no confirmation dialogs.**

| State | Appearance | Click action |
|---|---|---|
| Loading | Spinner + muted "Atlassian…" text | Disabled |
| Not connected | Grey Atlassian icon + "Connect Atlassian", dashed border | Fetch OAuth URL → navigate |
| Connected | Green Atlassian icon + "Atlassian connected", green tint | Call disconnect API → set connected=false |
| Error | Red tint + error message text | Retry same action |

### Atlassian icon

Use an inline SVG — `lucide-react` does not include an Atlassian logo. Use the following paths:

```tsx
<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
  <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.004-1.005z"/>
  <path d="M6.016 6.28H17.58a5.218 5.218 0 0 0-5.232-5.215h-2.13V1.008A5.215 5.215 0 0 0 5.012 6.22v.06"/>
</svg>
```

---

## Data flow

### Why not a browser redirect for connect?

`GET /api/auth/atlassian/connect` requires a JWT Bearer token (to generate the CSRF nonce tied to `userId`). A plain `window.location.href` redirect cannot send custom headers.

**Solution:** Change `handleAtlassianConnect` to return `{ url: string }` (JSON). The frontend calls it via `apiFetch` (adds Bearer header), checks `res.ok`, reads the URL, then navigates with `window.location.href`.

### OAuth callback return

After the user authorises in Atlassian, the backend callback stores the token and returns an HTML redirect to `/`. The app remounts, `useAtlassianStatus` fetches status on mount, and shows "connected". No special post-OAuth handling is needed.

Note: `useAtlassianStatus` is instantiated in `ChatContainer` and runs regardless of sidebar visibility, which is intentional — the status is fetched once on mount.

---

## Backend changes

### `packages/worker/src/api/atlassian-oauth.ts`

**`handleAtlassianConnect`** — change from redirect to JSON response:

```typescript
// Before: return Response.redirect(authUrl.toString(), 302);
// After:
return Response.json({ url: authUrl.toString() });
```

**New export `disconnectAtlassian`:**

```typescript
export async function disconnectAtlassian(userId: string, env: Env): Promise<void> {
  await env.PLANBOT_CONFIG.delete(kvKey(userId));
}
```

### `packages/worker/src/api/router.ts`

**Import:** Add `disconnectAtlassian` to the existing import from `./atlassian-oauth`:

```typescript
import {
  handleAtlassianConnect,
  handleAtlassianCallback,
  hasAtlassianToken,
  getAtlassianAccessToken,
  disconnectAtlassian,   // add this
} from "./atlassian-oauth";
```

**Update connect route** — `handleAtlassianConnect` now returns `Response.json(...)` instead of a redirect, so the route handler can stay as-is (still wrapped with `corsResponse`). No change to the route handler itself, only the underlying function changes.

**Add disconnect route** — place it alongside the other `/api/auth/atlassian/` routes, before the catch-all `Not Found` response:

```typescript
// DELETE /api/auth/atlassian/token — disconnect Atlassian
if (path === "/api/auth/atlassian/token" && method === "DELETE") {
  await disconnectAtlassian(userId, env);
  return corsJson({ ok: true });
}
```

---

## Frontend changes

### New: `packages/web/src/hooks/useAtlassianStatus.ts`

Export the interface so `ConversationSidebar` can import it:

```typescript
export interface AtlassianStatus {
  connected: boolean;
  loading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
```

**On mount:** `GET /api/auth/atlassian/status` → `{ connected: boolean }`. If fetch fails, treat as `connected: false` (don't block UI, no error shown).

**`connect()`:**
1. Call `apiFetch('/api/auth/atlassian/connect')`
2. If `!res.ok`, set `error = "Failed to connect. Try again."` and return
3. Parse `{ url }` from response JSON
4. `window.location.href = url`
5. On any exception, set `error = "Failed to connect. Try again."`

**`disconnect()`:**
1. Call `apiFetch('/api/auth/atlassian/token', { method: 'DELETE' })`
2. If `!res.ok`, set `error = "Failed to disconnect. Try again."` and return
3. On success: set `connected = false, error = null`
4. On any exception, set `error = "Failed to disconnect. Try again."`

### Updated: `packages/web/src/components/ConversationSidebar.tsx`

Import `AtlassianStatus` from `@/hooks/useAtlassianStatus`.

Add `atlassianStatus: AtlassianStatus` to `ConversationSidebarProps`.

In the footer, above the Sign out button, render an inline `AtlassianButton` function component:

```tsx
function AtlassianButton({ status }: { status: AtlassianStatus }) {
  if (status.loading) { /* spinner */ }
  if (status.error) { /* red error row with retry */ }
  if (status.connected) { /* green row */ }
  return /* grey "Connect Atlassian" row */;
}
```

Style with the same `Button` component (variant="ghost", size="sm") and Tailwind classes used by the Sign out button for visual consistency.

### Updated: `packages/web/src/components/ChatContainer.tsx`

```tsx
import { useAtlassianStatus } from "@/hooks/useAtlassianStatus";

// inside ChatContainer:
const atlassianStatus = useAtlassianStatus();

// pass to sidebar:
<ConversationSidebar
  ...
  atlassianStatus={atlassianStatus}
/>
```

---

## Error handling summary

| Scenario | Behaviour |
|---|---|
| Status fetch fails on mount | Treat as not connected, no error shown |
| `connect()` API call fails or non-ok response | `error` state set, shown inline in button area |
| `disconnect()` API call fails or non-ok response | `error` state set, status unchanged |
| OAuth callback error param from Atlassian | Backend returns 400 (existing behaviour) |

---

## Files changed

| File | Change |
|---|---|
| `packages/worker/src/api/atlassian-oauth.ts` | `handleAtlassianConnect` returns `{ url }` JSON; add `disconnectAtlassian` export |
| `packages/worker/src/api/router.ts` | Add `disconnectAtlassian` to import; add `DELETE /api/auth/atlassian/token` route before catch-all |
| `packages/web/src/hooks/useAtlassianStatus.ts` | New file — hook + exported `AtlassianStatus` interface |
| `packages/web/src/components/ConversationSidebar.tsx` | Import `AtlassianStatus`; add prop; render button above Sign out |
| `packages/web/src/components/ChatContainer.tsx` | Call `useAtlassianStatus()`; pass as prop to sidebar |
