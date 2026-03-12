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

### Model

OpenAI `gpt-4o-mini` — non-streaming, single completion call. Fast and cheap.

### Backend Changes

**`packages/shared/src/types.ts` (or `packages/worker/src/types.ts`):**
- Add `aiTitleGenerated?: boolean` to the `ChatConversation` interface.

**New file `packages/worker/src/chat/title.ts`:**
- Exports `generateConversationTitle(messages: ChatMessage[], apiKey: string): Promise<string>`
- Sends the last ≤10 messages to `gpt-4o-mini` with a system prompt:
  > "You are a conversation titler. Given the following chat messages, produce a concise title of at most 6 words that captures the main topic. Reply with only the title, no punctuation, no quotes."
- Returns the trimmed string. On any error, returns `null` (caller handles gracefully — no title update).

**`packages/worker/src/api/chat.ts`:**
- After `saveConversation`, check if title should be generated:
  ```
  if (!conversation.aiTitleGenerated && conversation.messages.length >= 6 && env.OPENAI_API_KEY)
  ```
- Call `generateConversationTitle`, update `conversation.title` and set `conversation.aiTitleGenerated = true`, call `saveConversation` again.
- Send a new SSE event **before closing the stream**:
  ```json
  { "type": "title_update", "data": { "title": "<generated title>" } }
  ```

**`packages/worker/src/types.ts`:**
- Add `title_update` to the `SSEEvent` union:
  ```ts
  | { type: "title_update"; data: { title: string } }
  ```

### Frontend Changes

**`packages/web/src/hooks/useChat.ts`:**
- Handle the `title_update` SSE event in the stream parser:
  - Set `conversationTitle` state to `data.title`
  - Update the matching entry in `conversations` list (patch its `title` field)

---

## 3. Rename Conversations

### Backend Changes

**`packages/worker/src/chat/conversation.ts`:**
- Add `updateConversationTitle(conversationId: string, userId: string, title: string, env: Env): Promise<boolean>`
  - Loads the conversation, verifies ownership, updates `conversation.title`, calls `saveConversation`, returns `true`. Returns `false` if not found or forbidden.

**`packages/worker/src/api/router.ts`:**
- Add `PATCH` to the `CORS_HEADERS` `Access-Control-Allow-Methods`.
- Add handler for `PATCH /api/chat/conversations/:id`:
  - Reads `{ title }` from body (validates: non-empty string, ≤200 chars)
  - Calls `updateConversationTitle`
  - Returns `{ ok: true }` or appropriate error

### Frontend Changes

**`packages/web/src/hooks/useChat.ts`:**
- Add `renameConversation(id: string, title: string): Promise<void>` to the hook:
  - Calls `PATCH /api/chat/conversations/:id` with `{ title }`
  - On success: updates `conversations` list entry and `conversationTitle` if it's the active conversation

**`packages/web/src/components/ConversationSidebar.tsx`:**
- Add `onRename: (id: string, title: string) => void` to `ConversationSidebarProps`
- Add local state: `renamingId: string | null` and `renameValue: string`
- When `renamingId` matches a conversation's id, render an `<input>` in place of the title `<p>`:
  - Pre-filled with current title
  - Auto-focused
  - `onKeyDown`: confirm on Enter, cancel on Escape
  - `onBlur`: confirm (treat as submit)
  - `onClick` on the item propagation is stopped while renaming
- Trigger: a pencil icon (`PencilIcon` from lucide-react) shown on hover alongside the existing trash icon; clicking sets `renamingId`

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

After 3rd exchange completes:
  → handleChat saves conversation
  → checks aiTitleGenerated && messages.length >= 6
  → generateConversationTitle(messages, apiKey) → gpt-4o-mini
  → saves updated title + flag
  → sends SSE { type: "title_update", data: { title } }
  → useChat handles title_update → updates sidebar + header

User renames conversation:
  → clicks pencil icon in sidebar
  → inline input appears, user types, presses Enter
  → ConversationSidebar.onRename(id, newTitle)
  → useChat.renameConversation(id, newTitle)
  → PATCH /api/chat/conversations/:id { title }
  → updateConversationTitle in conversation.ts
  → updates conversations list + conversationTitle state
```

---

## Error Handling

- **Title generation failure:** log the error, skip silently — conversation keeps its existing title. No SSE event sent. No user-visible impact.
- **Rename API failure:** silently fail (no optimistic update — input stays open so user can retry).
- **Load conversation failure:** existing `setError("Failed to load conversation")` behavior preserved.

---

## Out of Scope

- Regenerating titles on demand
- Bulk rename / batch operations
- Title history / undo
