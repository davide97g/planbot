import { useState, useCallback, useRef, useMemo } from "react";
import { apiFetch } from "@/lib/api";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  isError?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type ContentBlock =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolCall: ToolCall };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  /** Ordered interleaved blocks of text and tool calls */
  blocks?: ContentBlock[];
  agentName?: string;
  timestamp: string;
  tokenUsage?: TokenUsage;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  currentAgent: string | null;
  error: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  sendMessage: (text: string) => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  newConversation: () => void;
  conversations: Conversation[];
  loadConversations: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  totalTokenUsage: TokenUsage;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(
    null
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiFetch("/api/chat/conversations", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) {
          setConversationId(null);
          setConversationTitle(null);
          setMessages([]);
        }
      } catch {
        // silently fail
      }
    },
    [conversationId]
  );

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/chat/conversations/${id}`, {
        method: "GET",
      });
      if (res.ok) {
        const data = await res.json();
        const conv = data.conversation;
        setConversationId(id);
        setConversationTitle(conv.title || null);
        setMessages(conv.messages || []);
        setError(null);
      }
    } catch {
      setError("Failed to load conversation");
    }
  }, []);

  const newConversation = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setConversationId(null);
    setConversationTitle(null);
    setMessages([]);
    setError(null);
    setCurrentAgent(null);
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return;

      setError(null);

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);

      const assistantId = generateId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        toolCalls: [],
        blocks: [],
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            conversationId: conversationId || undefined,
            message: text,
          }),
          signal: abort.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.error || `Request failed: ${res.status}`);
        }

        if (!res.body) {
          throw new Error("No response body");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const jsonStr = trimmed.slice(6);
            if (jsonStr === "[DONE]") continue;

            try {
              const event = JSON.parse(jsonStr);
              const { type, data } = event;

              switch (type) {
                case "token":
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id !== assistantId) return m;
                      const tokenContent = data.content || "";
                      if (!tokenContent) {
                        // Meta-only token (agent name update)
                        return {
                          ...m,
                          agentName: (data.agentName && data.agentName !== "__meta") ? data.agentName : m.agentName,
                        };
                      }
                      const blocks = [...(m.blocks || [])];
                      const lastBlock = blocks[blocks.length - 1];
                      // Append to existing text block, or create a new one
                      if (lastBlock && lastBlock.type === "text") {
                        blocks[blocks.length - 1] = {
                          type: "text",
                          content: lastBlock.content + tokenContent,
                        };
                      } else {
                        blocks.push({ type: "text", content: tokenContent });
                      }
                      return {
                        ...m,
                        content: m.content + tokenContent,
                        blocks,
                        agentName: (data.agentName && data.agentName !== "__meta") ? data.agentName : m.agentName,
                      };
                    })
                  );
                  break;

                case "tool_call_start": {
                  const newToolCall: ToolCall = {
                    id: data.toolCall.id || generateId(),
                    name: data.toolCall.name || "unknown",
                    arguments: data.toolCall.arguments || {},
                  };
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id !== assistantId) return m;
                      return {
                        ...m,
                        toolCalls: [...(m.toolCalls || []), newToolCall],
                        blocks: [
                          ...(m.blocks || []),
                          { type: "tool_call", toolCall: newToolCall },
                        ],
                      };
                    })
                  );
                  break;
                }

                case "tool_call_result":
                  setMessages((prev) =>
                    prev.map((m) => {
                      if (m.id !== assistantId) return m;
                      const updateTC = (tc: ToolCall) =>
                        tc.id === data.result.toolCallId
                          ? { ...tc, result: data.result.result, isError: data.result.isError || false }
                          : tc;
                      return {
                        ...m,
                        toolCalls: (m.toolCalls || []).map(updateTC),
                        blocks: (m.blocks || []).map((b) =>
                          b.type === "tool_call" && b.toolCall.id === data.result.toolCallId
                            ? { type: "tool_call" as const, toolCall: updateTC(b.toolCall) }
                            : b
                        ),
                      };
                    })
                  );
                  break;

                case "agent_switch":
                  setCurrentAgent(data.to || null);
                  break;

                case "title_update":
                  setConversationTitle(data.title);
                  setConversations((prev) =>
                    prev.map((c) =>
                      c.id === conversationId
                        ? { ...c, title: data.title }
                        : c
                    )
                  );
                  break;

                case "done":
                  if (data.conversationId) {
                    setConversationId(data.conversationId);
                  }
                  if (data.title) {
                    setConversationTitle(data.title);
                  }
                  if (data.tokenUsage) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId
                          ? { ...m, tokenUsage: data.tokenUsage }
                          : m
                      )
                    );
                  }
                  break;

                case "error":
                  setError(data.message || "An error occurred");
                  break;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError((err as Error).message || "Failed to send message");
          // Remove the empty assistant message on failure
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, conversationId]
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        const res = await apiFetch(`/api/chat/conversations/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ title }),
        });
        if (res.ok) {
          setConversations((prev) =>
            prev.map((c) => (c.id === id ? { ...c, title } : c))
          );
          if (conversationId === id) {
            setConversationTitle(title);
          }
        }
      } catch {
        // silently fail
      }
    },
    [conversationId]
  );

  const totalTokenUsage = useMemo(() => {
    return messages.reduce(
      (acc, m) => {
        if (m.tokenUsage) {
          acc.promptTokens += m.tokenUsage.promptTokens;
          acc.completionTokens += m.tokenUsage.completionTokens;
          acc.totalTokens += m.tokenUsage.totalTokens;
        }
        return acc;
      },
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    );
  }, [messages]);

  return {
    messages,
    isStreaming,
    currentAgent,
    error,
    conversationId,
    conversationTitle,
    sendMessage,
    loadConversation,
    newConversation,
    conversations,
    loadConversations,
    deleteConversation,
    renameConversation,
    totalTokenUsage,
  };
}
