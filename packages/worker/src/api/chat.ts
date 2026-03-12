import type {
  AgentContext,
  ChatConversation,
  ChatMessage,
  Env,
  SSEEvent,
} from "../types";
import { createOrchestrator, createLLMProvider, runAgent } from "../agents";
import {
  loadConversation,
  saveConversation,
} from "../chat/conversation";
import { generateConversationTitle } from "../chat/title";
import { parseMentions, resolveMentions, stripResourceTags } from "../chat/mentions";
import {
  parseSlashCommand,
  getAgentForCommand,
  getHelpText,
} from "../chat/commands";

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseEncode(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ---------------------------------------------------------------------------
// Chat handler
// ---------------------------------------------------------------------------

/**
 * Handle POST /api/chat — SSE streaming chat endpoint.
 * Body: { conversationId?: string, message: string }
 */
export async function handleChat(
  request: Request,
  env: Env,
  userId: string,
): Promise<Response> {
  let body: { conversationId?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messageText = body.message?.trim();
  if (!messageText) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }

  // Load or create conversation
  let conversation: ChatConversation;
  if (body.conversationId) {
    const existing = await loadConversation(body.conversationId, env);
    if (!existing) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    if (existing.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    conversation = existing;
  } else {
    conversation = {
      id: crypto.randomUUID(),
      userId,
      title: messageText.slice(0, 100),
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  // Parse mentions (from both @-mentions and [S:BAT-123] tags)
  let mentions = parseMentions(messageText);
  if (mentions.length > 0) {
    mentions = await resolveMentions(mentions, env);
  }

  // Strip resource tags for the LLM — replace [S:BAT-3246] with BAT-3246
  const llmContent = stripResourceTags(messageText);

  // Build context string with resolved mention details
  let contextContent = llmContent;
  const resolvedMentions = mentions.filter((m) => m.resolved);
  if (resolvedMentions.length > 0) {
    const mentionContext = resolvedMentions
      .map((m) => {
        if (m.type === "confluence") {
          // Confluence pages have full body content — use structured format
          const lines = [`Confluence page (ID: ${m.id})`];
          if (m.resolved?.url) lines.push(`URL: ${m.resolved.url}`);
          if (m.resolved?.summary) lines.push(m.resolved.summary);
          return lines.join("\n");
        }
        // Jira issues — compact format
        const parts = [`[${m.id}]`];
        if (m.resolved?.summary) parts.push(m.resolved.summary);
        if (m.resolved?.status) parts.push(`Status: ${m.resolved.status}`);
        if (m.resolved?.url) parts.push(m.resolved.url);
        return parts.join(" — ");
      })
      .join("\n\n");
    contextContent = `${llmContent}\n\n---\nReferenced resources (already fetched — do NOT re-fetch these):\n${mentionContext}`;
  }

  // Build user message: original text for display, enriched content for LLM
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: messageText,
    mentions: mentions.length > 0 ? mentions : undefined,
    timestamp: new Date().toISOString(),
  };
  conversation.messages.push(userMessage);

  // Build a separate LLM-facing message with resolved context
  const llmUserMessage: ChatMessage = {
    ...userMessage,
    content: contextContent,
  };

  // Set up abort controller for stream lifecycle
  const abortController = new AbortController();

  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const textEncoder = new TextEncoder();

      function send(event: SSEEvent): void {
        controller.enqueue(textEncoder.encode(sseEncode(event)));
      }

      try {
        // Send the conversation ID so the client knows it
        send({
          type: "token",
          data: {
            content: "",
            agentName: "__meta",
          },
        } as SSEEvent);

        // Check for slash commands
        const slashCmd = parseSlashCommand(messageText);

        if (slashCmd && slashCmd.command === "help") {
          // Return help text immediately — no LLM call needed
          const helpMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: getHelpText(),
            agentName: "system",
            timestamp: new Date().toISOString(),
          };

          send({ type: "done", data: { message: helpMessage } });
          conversation.messages.push(helpMessage);
        } else {
          // Determine which agent to use
          let agentEvents: AsyncIterable<SSEEvent>;
          // Use LLM-enriched message (with resolved mentions) for the agent
          const llmMessages = [
            ...conversation.messages.slice(0, -1),
            llmUserMessage,
          ];
          const context: AgentContext = {
            env,
            conversationId: conversation.id,
            messages: llmMessages,
            abortSignal: abortController.signal,
          };

          if (slashCmd) {
            const agent = getAgentForCommand(slashCmd.command);
            if (agent) {
              // Slash command with a known agent — run it directly
              send({
                type: "agent_switch",
                data: { from: "user", to: agent.name },
              });

              // Replace the user message content with just the args for the agent
              const agentContext: AgentContext = {
                ...context,
                messages: [
                  ...conversation.messages.slice(0, -1),
                  { ...userMessage, content: slashCmd.args || messageText },
                ],
              };

              const provider = createLLMProvider(env);
              agentEvents = runAgent(agent, agentContext, provider);
            } else {
              // Unknown command — fall through to orchestrator
              const orchestrator = createOrchestrator();
              agentEvents = orchestrator.run(context);
            }
          } else {
            // Regular message — use orchestrator
            const orchestrator = createOrchestrator();
            agentEvents = orchestrator.run(context);
          }

          // Stream events
          let assistantMessage: ChatMessage | null = null;

          for await (const event of agentEvents) {
            if (abortController.signal.aborted) break;

            send(event);

            if (event.type === "done") {
              assistantMessage = event.data.message;
            }
          }

          // Add assistant message to conversation if we got one
          if (assistantMessage) {
            conversation.messages.push(assistantMessage);
          }
        }

        // Update conversation metadata
        conversation.updatedAt = new Date().toISOString();

        // Save conversation to KV
        await saveConversation(conversation, env);

        // Send final metadata
        send({
          type: "done",
          data: {
            message: {
              id: "__conversation_meta",
              role: "assistant",
              content: "",
              timestamp: new Date().toISOString(),
            },
          },
        } as SSEEvent);

        // Generate AI title after 3rd exchange (≥6 messages), once only
        try {
          if (
            !conversation.aiTitleGenerated &&
            conversation.messages.length >= 6 &&
            env.OPENAI_API_KEY
          ) {
            const generated = await generateConversationTitle(
              conversation.messages,
              env.OPENAI_API_KEY,
            );
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
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        send({ type: "error", data: { message, code: "INTERNAL_ERROR" } });
      } finally {
        controller.close();
      }
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": conversation.id,
    },
  });
}
