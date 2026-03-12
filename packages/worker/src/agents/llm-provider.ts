import type {
  Env,
  LLMProvider,
  LLMMessage,
  LLMOptions,
  StreamEvent,
  ToolCall,
  ToolDefinition,
} from "../types";

// ---------------------------------------------------------------------------
// SSE stream parser
// ---------------------------------------------------------------------------

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<{ event?: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent: string | undefined;
      let currentData: string[] = [];

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          currentData.push(line.slice(5).trim());
        } else if (line === "") {
          if (currentData.length > 0) {
            yield { event: currentEvent, data: currentData.join("\n") };
          }
          currentEvent = undefined;
          currentData = [];
        }
      }
    }
    // Flush remaining
    if (buffer.trim()) {
      const lines = buffer.split("\n");
      let currentEvent: string | undefined;
      let currentData: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          currentData.push(line.slice(5).trim());
        } else if (line === "") {
          if (currentData.length > 0) {
            yield { event: currentEvent, data: currentData.join("\n") };
          }
          currentEvent = undefined;
          currentData = [];
        }
      }
      if (currentData.length > 0) {
        yield { event: currentEvent, data: currentData.join("\n") };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// OpenAI Provider
// ---------------------------------------------------------------------------

function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    async *chat(
      messages: LLMMessage[],
      tools: ToolDefinition[],
      options?: LLMOptions,
    ): AsyncIterable<StreamEvent> {
      const model = options?.model ?? "gpt-4o";

      // Convert messages to OpenAI format
      const openaiMessages = messages.map((m) => {
        if (m.role === "tool") {
          return {
            role: "tool" as const,
            content: m.content as string,
            tool_call_id: m.toolCallId ?? "",
          };
        }
        if (m.role === "assistant" && m.toolCalls?.length) {
          return {
            role: "assistant" as const,
            content: (m.content as string) || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
        }
        if (Array.isArray(m.content)) {
          return {
            role: m.role,
            content: m.content.map((part) => {
              if (part.type === "text") return { type: "text" as const, text: part.text };
              return {
                type: "image_url" as const,
                image_url: { url: `data:${part.mimeType};base64,${part.data}` },
              };
            }),
          };
        }
        return { role: m.role, content: m.content };
      });

      // Convert tools to OpenAI format
      const openaiTools = tools.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      const body: Record<string, unknown> = {
        model,
        messages: openaiMessages,
        stream: true,
      };
      if (openaiTools.length > 0) {
        body.tools = openaiTools;
      }
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }
      if (options?.maxTokens !== undefined) {
        body.max_tokens = options.maxTokens;
      }

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI API error ${response.status}: ${errorText}`,
        );
      }

      if (!response.body) {
        throw new Error("OpenAI response has no body");
      }

      let fullContent = "";
      const toolCallsMap = new Map<
        number,
        { id: string; name: string; arguments: string }
      >();

      for await (const sse of parseSSEStream(response.body)) {
        if (sse.data === "[DONE]") break;

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(sse.data);
        } catch {
          continue;
        }

        const choices = parsed.choices as Array<Record<string, unknown>>;
        if (!choices?.length) continue;

        const delta = choices[0].delta as Record<string, unknown> | undefined;
        if (!delta) continue;

        // Text content
        if (typeof delta.content === "string" && delta.content) {
          fullContent += delta.content;
          yield { type: "token", content: delta.content };
        }

        // Tool calls (arrive incrementally)
        const deltaToolCalls = delta.tool_calls as
          | Array<Record<string, unknown>>
          | undefined;
        if (deltaToolCalls) {
          for (const dtc of deltaToolCalls) {
            const index = dtc.index as number;
            const fn = dtc.function as
              | Record<string, unknown>
              | undefined;

            if (!toolCallsMap.has(index)) {
              toolCallsMap.set(index, {
                id: (dtc.id as string) ?? "",
                name: (fn?.name as string) ?? "",
                arguments: (fn?.arguments as string) ?? "",
              });
            } else {
              const existing = toolCallsMap.get(index)!;
              if (dtc.id) existing.id = dtc.id as string;
              if (fn?.name) existing.name = fn.name as string;
              if (fn?.arguments)
                existing.arguments += fn.arguments as string;
            }
          }
        }
      }

      // Build final tool calls
      const toolCalls: ToolCall[] = [];
      for (const [, tc] of [...toolCallsMap.entries()].sort(
        (a, b) => a[0] - b[0],
      )) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          // leave empty
        }
        const toolCall: ToolCall = {
          id: tc.id,
          name: tc.name,
          arguments: args,
        };
        toolCalls.push(toolCall);
        yield { type: "tool_call", toolCall };
      }

      yield { type: "done", content: fullContent, toolCalls };
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic Provider
// ---------------------------------------------------------------------------

function createAnthropicProvider(apiKey: string): LLMProvider {
  return {
    async *chat(
      messages: LLMMessage[],
      tools: ToolDefinition[],
      options?: LLMOptions,
    ): AsyncIterable<StreamEvent> {
      const model = options?.model ?? "claude-sonnet-4-20250514";

      // Separate system message from conversation messages
      let systemText = "";
      const conversationMessages: LLMMessage[] = [];
      for (const m of messages) {
        if (m.role === "system") {
          systemText += (systemText ? "\n\n" : "") + (m.content as string);
        } else {
          conversationMessages.push(m);
        }
      }

      // Convert messages to Anthropic format
      const anthropicMessages = convertToAnthropicMessages(conversationMessages);

      // Convert tools to Anthropic format
      const anthropicTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));

      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 4096,
        messages: anthropicMessages,
        stream: true,
      };
      if (systemText) {
        body.system = systemText;
      }
      if (anthropicTools.length > 0) {
        body.tools = anthropicTools;
      }
      if (options?.temperature !== undefined) {
        body.temperature = options.temperature;
      }

      const response = await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Anthropic API error ${response.status}: ${errorText}`,
        );
      }

      if (!response.body) {
        throw new Error("Anthropic response has no body");
      }

      let fullContent = "";
      const toolCalls: ToolCall[] = [];
      let currentToolUse: {
        id: string;
        name: string;
        arguments: string;
      } | null = null;

      for await (const sse of parseSSEStream(response.body)) {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(sse.data);
        } catch {
          continue;
        }

        const eventType = sse.event ?? (parsed.type as string);

        switch (eventType) {
          case "content_block_start": {
            const block = parsed.content_block as Record<string, unknown>;
            if (block?.type === "tool_use") {
              currentToolUse = {
                id: block.id as string,
                name: block.name as string,
                arguments: "",
              };
            }
            break;
          }

          case "content_block_delta": {
            const delta = parsed.delta as Record<string, unknown>;
            if (delta?.type === "text_delta") {
              const text = delta.text as string;
              fullContent += text;
              yield { type: "token", content: text };
            } else if (delta?.type === "input_json_delta" && currentToolUse) {
              currentToolUse.arguments +=
                (delta.partial_json as string) ?? "";
            }
            break;
          }

          case "content_block_stop": {
            if (currentToolUse) {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(currentToolUse.arguments);
              } catch {
                // leave empty
              }
              const toolCall: ToolCall = {
                id: currentToolUse.id,
                name: currentToolUse.name,
                arguments: args,
              };
              toolCalls.push(toolCall);
              yield { type: "tool_call", toolCall };
              currentToolUse = null;
            }
            break;
          }

          case "message_stop": {
            // Will yield done below
            break;
          }
        }
      }

      yield { type: "done", content: fullContent, toolCalls };
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic message conversion helpers
// ---------------------------------------------------------------------------

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  source?: { type: string; media_type: string; data: string };
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

function convertToAnthropicMessages(
  messages: LLMMessage[],
): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "user") {
      if (Array.isArray(m.content)) {
        const blocks: AnthropicContentBlock[] = m.content.map((part) => {
          if (part.type === "text") return { type: "text", text: part.text };
          return {
            type: "image",
            source: { type: "base64", media_type: part.mimeType, data: part.data },
          };
        });
        result.push({ role: "user", content: blocks });
      } else {
        result.push({ role: "user", content: m.content });
      }
    } else if (m.role === "assistant") {
      if (m.toolCalls?.length) {
        const content: AnthropicContentBlock[] = [];
        if (m.content) {
          content.push({ type: "text", text: m.content as string });
        }
        for (const tc of m.toolCalls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        result.push({ role: "assistant", content });
      } else {
        result.push({ role: "assistant", content: m.content as string });
      }
    } else if (m.role === "tool") {
      // Anthropic expects tool results in a user message
      const toolResultBlock: AnthropicContentBlock = {
        type: "tool_result",
        tool_use_id: m.toolCallId ?? "",
        content: m.content as string,
      };
      // Check if last message is already a user message with tool_result blocks
      const last = result[result.length - 1];
      if (last?.role === "user" && Array.isArray(last.content)) {
        (last.content as AnthropicContentBlock[]).push(toolResultBlock);
      } else {
        result.push({ role: "user", content: [toolResultBlock] });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLLMProvider(env: Env): LLMProvider {
  const providerName = (env.LLM_PROVIDER ?? "openai").toLowerCase();

  if (providerName === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required for Anthropic provider");
    }
    return createAnthropicProvider(env.ANTHROPIC_API_KEY);
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for OpenAI provider");
  }
  return createOpenAIProvider(env.OPENAI_API_KEY);
}
