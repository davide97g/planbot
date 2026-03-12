import type {
  Agent,
  AgentContext,
  ChatMessage,
  LLMMessage,
  LLMProvider,
  SSEEvent,
  ToolCall,
} from "../types";
import { executeToolCall } from "../tools";

const MAX_ITERATIONS = 10;

/**
 * Core agentic loop: sends messages to the LLM, streams tokens,
 * executes tool calls, and loops until the model stops calling tools
 * or we hit the iteration limit.
 */
export async function* runAgent(
  agent: Agent,
  context: AgentContext,
  provider: LLMProvider,
): AsyncIterable<SSEEvent> {
  // Build initial LLM message list
  const llmMessages: LLMMessage[] = [
    { role: "system", content: agent.systemPrompt },
    ...context.messages.map(chatMessageToLLM),
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Check abort
    if (context.abortSignal?.aborted) {
      yield {
        type: "error",
        data: { message: "Request was aborted", code: "ABORTED" },
      };
      return;
    }

    let fullContent = "";
    let toolCalls: ToolCall[] = [];

    try {
      for await (const event of provider.chat(
        llmMessages,
        agent.tools,
      )) {
        switch (event.type) {
          case "token":
            yield {
              type: "token",
              data: { content: event.content, agentName: agent.name },
            };
            break;

          case "tool_call":
            yield {
              type: "tool_call_start",
              data: { toolCall: event.toolCall, agentName: agent.name },
            };
            break;

          case "done":
            fullContent = event.content;
            toolCalls = event.toolCalls;
            break;
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      yield { type: "error", data: { message, code: "LLM_ERROR" } };
      return;
    }

    // If no tool calls, we're done
    if (toolCalls.length === 0) {
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: fullContent,
        agentName: agent.name,
        timestamp: new Date().toISOString(),
      };
      yield { type: "done", data: { message: assistantMessage } };
      return;
    }

    // Append assistant message with tool calls to conversation
    llmMessages.push({
      role: "assistant",
      content: fullContent,
      toolCalls,
    });

    // Execute each tool call
    for (const toolCall of toolCalls) {
      const result = await executeToolCall(toolCall, context.env);

      yield {
        type: "tool_call_result",
        data: { result, agentName: agent.name },
      };

      // Append tool result to messages
      llmMessages.push({
        role: "tool",
        content: JSON.stringify(result.result),
        toolCallId: toolCall.id,
      });
    }

    // Loop back to call the LLM again with tool results
  }

  // Hit max iterations — yield what we have
  yield {
    type: "error",
    data: {
      message: `Agent ${agent.name} reached maximum iterations (${MAX_ITERATIONS})`,
      code: "MAX_ITERATIONS",
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chatMessageToLLM(msg: ChatMessage): LLMMessage {
  if (msg.role === "tool" && msg.toolResults?.length) {
    // For tool messages, use the first tool result
    const tr = msg.toolResults[0];
    return {
      role: "tool",
      content: msg.content || JSON.stringify(tr.result),
      toolCallId: tr.toolCallId,
    };
  }

  return {
    role: msg.role === "tool" ? "user" : msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls,
  };
}
