# Atlassian Integration Button

**Date:** 2026-03-12
**Status:** Approved

## Summary

Add an Atlassian OAuth connection button to the sidebar footer so users can connect or disconnect their Atlassian account directly from the chat UI. The button shows live connection status and triggers the OAuth flow or disconnects with a single click.

---

## Placement

The button lives in `ConversationSidebar` footer, above the existing "Sign out" button. It is hidden when the sidebar is collapsed (this is acceptable — the sidebar must be open to access account actions anyway).

---

## Interaction model

**Direct action — no confirmation dialogs.**

| State | Appearance | Click action |
|---|---|---|
| Loading | Spinner, muted text "Atlassian…" | Disabled |
| Not connected | Grey Atlassian icon + "Connect Atlassian" text, dashed border | Fetch OAuth URL → `window.location.href = url` |
| Connected | Green Atlassian icon + "Atlassian connected" text, green tint | Call disconnect API → set `connected = false` |
| Error | Red tint + error text | Retry (same action) |

---

## Data flow

### Why not a browser redirect for connect?

`GET /api/auth/atlassian/connect` requires a JWT Bearer token (to generate the CSRF nonce tied to `userId`). A plain `window.location.href` redirect cannot send custom headers.

**Solution:** Change `handleAtlassianConnect` to return `{ url: string }` (JSON). The frontend calls it via `apiFetch` (adds Bearer header), receives the Atlassian OAuth URL, then navigates with `window.location.href`.

### OAuth callback return

After the user authorises in Atlassian, the backend callback stores the token and returns an HTML redirect to `/`. The app remounts, `useAtlassianStatus` fetches status on mount, and shows "connected". No special post-OAuth handling is needed.

---

## Backend changes

### `packages/worker/src/api/atlassian-oauth.ts`

**`handleAtlassianConnect`** — change return type from `Response.redirect` to JSON:

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

- Update `GET /api/auth/atlassian/connect` to forward the JSON response (no redirect).
- Add new authenticated route:

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

```typescript
interface AtlassianStatus {
  connected: boolean;
  loading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}
```

**On mount:** `GET /api/auth/atlassian/status` → `{ connected: boolean }`. If fetch fails, treat as `connected: false` (don't block UI).

**`connect()`:**
1. Call `apiFetch('/api/auth/atlassian/connect')`
2. Parse `{ url }` from response
3. `window.location.href = url`

**`disconnect()`:**
1. Call `apiFetch('/api/auth/atlassian/token', { method: 'DELETE' })`
2. On success: set `connected = false, error = null`
3. On failure: set `error = "Failed to disconnect. Try again."`

### Updated: `packages/web/src/components/ConversationSidebar.tsx`

Add `atlassianStatus: AtlassianStatus` to `ConversationSidebarProps`.

In the footer, above the Sign out button, render an `AtlassianButton` sub-component (inline in the same file) that maps status to the correct visual state (loading spinner, grey/green/red button).

### Updated: `packages/web/src/components/ChatContainer.tsx`

Call `useAtlassianStatus()` and pass the result as `atlassianStatus` prop to `ConversationSidebar`.

---

## Error handling

| Scenario | Behaviour |
|---|---|
| Status fetch fails on mount | Treat as not connected, no error shown |
| `connect()` API call fails | Show inline error text in button area |
| `disconnect()` API call fails | Show inline error text, status unchanged |
| OAuth callback returns error param | Backend returns 400 with message (existing behaviour) |

---

## Files changed

| File | Change |
|---|---|
| `packages/worker/src/api/atlassian-oauth.ts` | Return `{ url }` from connect; add `disconnectAtlassian` |
| `packages/worker/src/api/router.ts` | Update connect route; add DELETE token route |
| `packages/web/src/hooks/useAtlassianStatus.ts` | New hook |
| `packages/web/src/components/ConversationSidebar.tsx` | Add button to footer |
| `packages/web/src/components/ChatContainer.tsx` | Wire hook → sidebar prop |
