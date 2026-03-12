import type { ChatConversation, Env } from "../types";

// ---------------------------------------------------------------------------
// KV key helpers
// ---------------------------------------------------------------------------

function conversationKey(id: string): string {
  return `chat:${id}`;
}

function userListKey(userId: string): string {
  return `chat:user:${userId}:list`;
}

// ---------------------------------------------------------------------------
// Conversation list entry (lightweight, stored per-user)
// ---------------------------------------------------------------------------

interface ConversationListEntry {
  id: string;
  title: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function loadConversation(
  conversationId: string,
  env: Env,
): Promise<ChatConversation | null> {
  const raw = await env.PLANBOT_CHAT.get(conversationKey(conversationId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ChatConversation;
  } catch {
    return null;
  }
}

export async function saveConversation(
  conversation: ChatConversation,
  env: Env,
): Promise<void> {
  // Save the full conversation
  await env.PLANBOT_CHAT.put(
    conversationKey(conversation.id),
    JSON.stringify(conversation),
  );

  // Update the user's conversation list
  const listRaw = await env.PLANBOT_CHAT.get(userListKey(conversation.userId));
  let list: ConversationListEntry[] = listRaw ? JSON.parse(listRaw) : [];

  // Upsert the entry
  const entry: ConversationListEntry = {
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
  };

  const existingIndex = list.findIndex((e) => e.id === conversation.id);
  if (existingIndex >= 0) {
    list[existingIndex] = entry;
  } else {
    list.push(entry);
  }

  // Sort by updatedAt descending (most recent first)
  list.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  await env.PLANBOT_CHAT.put(
    userListKey(conversation.userId),
    JSON.stringify(list),
  );
}

export async function listConversations(
  userId: string,
  env: Env,
): Promise<ConversationListEntry[]> {
  const raw = await env.PLANBOT_CHAT.get(userListKey(userId));
  if (!raw) return [];

  try {
    return JSON.parse(raw) as ConversationListEntry[];
  } catch {
    return [];
  }
}

export async function updateConversationTitle(
  conversationId: string,
  userId: string,
  title: string,
  env: Env,
): Promise<boolean> {
  const conversation = await loadConversation(conversationId, env);
  if (!conversation) return false;
  if (conversation.userId !== userId) return false;

  conversation.title = title;
  await saveConversation(conversation, env);
  return true;
}

export async function deleteConversation(
  conversationId: string,
  userId: string,
  env: Env,
): Promise<void> {
  // Delete the conversation data
  await env.PLANBOT_CHAT.delete(conversationKey(conversationId));

  // Remove from user's list
  const listRaw = await env.PLANBOT_CHAT.get(userListKey(userId));
  if (listRaw) {
    let list: ConversationListEntry[] = JSON.parse(listRaw);
    list = list.filter((e) => e.id !== conversationId);
    await env.PLANBOT_CHAT.put(userListKey(userId), JSON.stringify(list));
  }
}
