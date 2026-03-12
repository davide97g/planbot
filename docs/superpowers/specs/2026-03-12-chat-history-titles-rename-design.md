# Chat History Load Fix, AI Titles & Conversation Rename

**Date:** 2026-03-12
**Status:** Approved

---

## Problem Statement

Three issues need addressing in the PlanBot web chat UI:

1. **Bug:** Clicking a conversation in the sidebar does not load it — the messages area stays blank.
2. **Feature:** Conversation titles are currently set to the first 100 chars of the user's first message. They should be AI-generated summaries after enough context has accumulated (≥3 exchanges).
3. **Feature:** Users have no way to rename a conversation. They should be able to inline-rename from the sidebar.

---

## 1. Bug Fix: Click-to-Load

### Root Cause

`useChat.ts:loadConversation` reads `data.title` and `data.messages` directly from the API response, but the endpoint `GET /api/chat/conversations/:id` returns `{ conversation: { id, title, messages, ... } }`. The data is nested one level deeper than expected, so both values are always `undefined`.

### Fix

In `useChat.ts`, destructure `data.conversation` before reading `title` and `messages`.

**Scope:** single file, two lines changed.

---

## 2. AI-Generated Conversation Titles

### Trigger Condition

A title is generated **once** per conversation, when:
- The conversation has `aiTitleGenerated !== true` (no AI title yet), AND
- The conversation now has **≥ 6 messages** (3 user + 3 assistant — enough context for a meaningful title)

Note: because the trigger requires ≥6 messages, the conversation will already exist in the client's `conversations` list (it was added during the first exchange's `loadConversations` refetch), so the `title_update` patch-by-id logic will always find a matching entry.

### Model

OpenAI `gpt-4o-mini` — non-streaming, single completion call. Fast and cheap.

### Backend Changes

**`packages/shared/src/types.ts`** (the canonical type file — do NOT add to `packages/worker/src/types.ts` which re-exports from shared):
- Add `aiTitleGenerated?: boolean` to the `ChatConversation` interface.

**New file `packages/worker/src/chat/title.ts`:**
- Exports `generateConversationTitle(messages: ChatMessage[], apiKey: string): Promise<string | null>`
- Sends the last ≤10 messages to `gpt-4o-mini` (non-streaming) with a system prompt:
  > "You are a conversation titler. Given the following chat messages, produce a concise title of at most 6 words that captures the main topic. Reply with only the title, no punctuation, no quotes."
- Returns the trimmed string on success. On **any** error (network, API, parse), catches internally and returns `null`. The function never throws.

**`packages/worker/src/api/chat.ts`:**

After the main `saveConversation` call and after sending the final metadata `done` event, add a title generation block wrapped in its **own `try/catch`** (inside the outer `try`, but isolated so errors do not propagate to the outer `catch` and do not trigger an `error` SSE event):

```
// Inside the main try, after the final metadata done event:
try {
  if (!conversation.aiTitleGenerated && conversation.messages.length >= 6 && env.OPENAI_API_KEY) {
    const generated = await generateConversationTitle(conversation.messages, env.OPENAI_API_KEY);
    if (generated) {
      conversation.title = generated;
      conversation.aiTitleGenerated = true;
      await saveConversation(conversation, env);
      send({ type: "title_update", data: { title: generated } });
    }
  }
} catch {
  // silently ignore — title generation is best-effort
}
```

Event ordering within the stream:
1. Main agent `done` event (with assistant message)
2. `saveConversation` (first save)
3. Final metadata `done` event (with `id: "__conversation_meta"`)
4. **Title generation block** (own try/catch)
5. `title_update` SSE event (only if title was generated)
6. Stream closes (`controller.close()` in `finally`)

**`packages/worker/src/types.ts`:**
- Add `title_update` to the `SSEEvent` union:
  ```ts
  | { type: "title_update"; data: { title: string } }
  ```

### Frontend Changes

**`packages/web/src/hooks/useChat.ts`:**
- Handle the `title_update` SSE event in the stream parser `switch (type)` block:
  - Set `conversationTitle` state to `data.title`
  - Patch the matching entry in `conversations` list by id (update its `title` field)
- Add `renameConversation` to the `UseChatReturn` interface (see section 3).

---

## 3. Rename Conversations

### Backend Changes

**`packages/worker/src/chat/conversation.ts`:**
- Add `updateConversationTitle(conversationId: string, userId: string, title: string, env: Env): Promise<boolean>`
  - Loads the conversation, verifies ownership (`conversation.userId === userId`), updates `conversation.title`, calls `saveConversation`, returns `true`.
  - Returns `false` if conversation not found or userId does not match (no error thrown).

**`packages/worker/src/api/router.ts`:**
- Add `PATCH` to the `CORS_HEADERS` `Access-Control-Allow-Methods` string.
- Add the `PATCH` handler **inside the existing `if (conversationMatch)` block** (do not create a new regex or route block):
  ```
  if (conversationMatch) {
    const conversationId = conversationMatch[1];
    if (method === "GET") { ... }
    if (method === "DELETE") { ... }
    if (method === "PATCH") {
      // new handler goes here
    }
  }
  ```
  - Reads `{ title }` from request body JSON
  - Validates: `title` must be a non-empty string, ≤200 chars; return 400 otherwise
  - Calls `updateConversationTitle(conversationId, userId, title, env)`
  - Returns `corsJson({ ok: true })` on success, `corsJson({ error: "Not found" }, 404)` if false

### Frontend Changes

**`packages/web/src/hooks/useChat.ts`:**
- Add `renameConversation(id: string, title: string): Promise<void>` implementation:
  - Calls `PATCH /api/chat/conversations/:id` with `{ title }`
  - On success (res.ok): updates the matching entry in `conversations` list and, if `id === conversationId`, updates `conversationTitle` state
  - On failure: does nothing (no optimistic update)
- Add `renameConversation: (id: string, title: string) => Promise<void>` to the **`UseChatReturn` interface** (this is required for TypeScript to compile; without it the build will fail).
- Return `renameConversation` from the hook's return object.

**`packages/web/src/components/ConversationSidebar.tsx`:**
- Add `onRename: (id: string, title: string) => void` to `ConversationSidebarProps`
- Add local state: `renamingId: string | null` and `renameValue: string`
- When `renamingId` matches a conversation's id, render an `<input>` in place of the title `<p>`:
  - Pre-filled with current title (set `renameValue` when entering rename mode)
  - Auto-focused (`autoFocus` prop)
  - `onKeyDown`:
    - Enter: call `onRename(renamingId, renameValue.trim())` if non-empty, then `setRenamingId(null)`
    - Escape: cancel — `setRenamingId(null)` only, do not call `onRename`
  - `onBlur`: **cancel** (set `setRenamingId(null)` without calling `onRename`). This avoids a conflict where clicking the trash icon on the same row would trigger `onBlur` and submit an unintended rename before opening the delete dialog.
  - `onClick` on the item: stop propagation while renaming (prevent `onSelect` from firing)
- Trigger: a pencil icon (`PencilIcon` from lucide-react) shown on hover alongside the existing trash icon; clicking sets `renamingId` to that conversation's id and `renameValue` to its current title
- The delete icon should remain hidden while `renamingId` is active for that item (to reduce confusion)

**`packages/web/src/components/ChatContainer.tsx`:**
- Pass `onRename={(id, title) => chat.renameConversation(id, title)}` to `<ConversationSidebar>`

---

## Data Flow Summary

```
User clicks history item
  → ConversationSidebar.onSelect(id)
  → useChat.loadConversation(id)
  → GET /api/chat/conversations/:id
  → destructure data.conversation  ← bug fix
  → setMessages / setConversationTitle

After 3rd exchange completes (messages.length reaches 6):
  → handleChat saves conversation (first save)
  → sends final metadata done event
  → title generation block (own try/catch):
      → generateConversationTitle(messages, apiKey) → gpt-4o-mini
      → saves updated conversation (second save)
      → sends SSE { type: "title_update", data: { title } }
  → stream closes
  → useChat handles title_update → patches sidebar list + updates header

User renames conversation:
  → clicks pencil icon in sidebar
  → inline input appears, user types, presses Enter
  → ConversationSidebar.onRename(id, newTitle)
  → useChat.renameConversation(id, newTitle)
  → PATCH /api/chat/conversations/:id { title }  [inside conversationMatch block]
  → updateConversationTitle in conversation.ts
  → updates conversations list + conversationTitle state
```

---

## Error Handling

- **Title generation failure:** the isolated `try/catch` in `chat.ts` ensures no `error` SSE event reaches the client. The conversation keeps its existing title. No user-visible impact.
- **Rename API failure:** no optimistic update — input closes without saving. User can click the pencil icon again to retry.
- **Rename input blur:** treated as **cancel**, not confirm, to avoid race with delete action on the same row.
- **Load conversation failure:** existing `setError("Failed to load conversation")` behavior preserved.

---

## Out of Scope

- Regenerating titles on demand
- Bulk rename / batch operations
- Title history / undo
