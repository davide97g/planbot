import type {
  Agent,
  AgentContext,
  ChatMessage,
  LLMMessage,
  SSEEvent,
  ToolCall,
  ToolDefinition,
} from "../types";
import { createLLMProvider } from "./llm-provider";
import { createPlanningAgent } from "./planning";
import { createJiraAgent } from "./jira-agent";
import { createConfluenceAgent } from "./confluence-agent";
import { createReportingAgent } from "./reporting";
import { runAgent } from "./runner";

// ---------------------------------------------------------------------------
// Delegation tools (orchestrator-only, not in the shared tool system)
// ---------------------------------------------------------------------------

const orchestratorTools: ToolDefinition[] = [
  {
    name: "delegate_planning",
    description:
      "Delegate to the planning agent for creating project plans, sprint plans, or release plans",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What to plan — include all relevant context",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "delegate_jira",
    description:
      "Delegate to the Jira agent for searching issues, analyzing sprints, or inspecting versions",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What to search or analyze in Jira",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "delegate_confluence",
    description:
      "Delegate to the Confluence agent for searching and summarizing documentation",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What documentation to find or summarize",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "delegate_reporting",
    description:
      "Delegate to the reporting agent for generating Excel reports from project data",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What report to generate",
        },
      },
      required: ["task"],
    },
  },
];

const SYSTEM_PROMPT = `You are PlanBot, an AI project planning assistant that helps teams with Jira-based project management, planning, and documentation.

You can answer simple questions directly, but for specialized tasks you should delegate to the right specialist agent:

- **Planning Agent**: Creating project plans, sprint plans, release plans, capacity analysis
- **Jira Agent**: Searching issues, analyzing sprints, inspecting versions, JQL queries
- **Confluence Agent**: Finding and summarizing documentation, specs, meeting notes
- **Reporting Agent**: Generating Excel reports from project data

When delegating, provide clear context about what the user needs. Include any specific details like version names, sprint names, team names, JQL queries, or date ranges.

For general questions about your capabilities, greetings, or simple follow-ups, respond directly without delegating.

## Output format rules
- When presenting Jira issues, ALWAYS use markdown tables with columns: Key | Summary | Type | Status | Assignee
- NEVER generate Jira search/JQL URLs in your output — use the tool to fetch actual issue data and present the results directly
- NEVER output URL-encoded strings or raw JQL queries to the user
- Reference Jira issues by their key only (e.g. BAT-3314), not as links
- Reference Confluence pages by their title, not as URLs
- Use markdown headings, tables, and bullet points for structured data`;

// ---------------------------------------------------------------------------
// Agent factory map
// ---------------------------------------------------------------------------

const DELEGATE_MAP: Record<string, () => Agent> = {
  delegate_planning: createPlanningAgent,
  delegate_jira: createJiraAgent,
  delegate_confluence: createConfluenceAgent,
  delegate_reporting: createReportingAgent,
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function createOrchestrator(): Agent {
  return {
    name: "orchestrator",
    description: "Routes user requests to specialist agents",
    systemPrompt: SYSTEM_PROMPT,
    tools: orchestratorTools,

    async *run(context: AgentContext): AsyncIterable<SSEEvent> {
      const provider = createLLMProvider(context.env);

      const llmMessages: LLMMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...context.messages.map(chatMessageToLLM),
      ];

      const MAX_ITERATIONS = 5;

      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
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
            orchestratorTools,
          )) {
            switch (event.type) {
              case "token":
                yield {
                  type: "token",
                  data: { content: event.content, agentName: "orchestrator" },
                };
                break;
              case "tool_call":
                // Don't yield tool_call_start for delegation tools — we yield agent_switch instead
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

        // No tool calls — orchestrator is done
        if (toolCalls.length === 0) {
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullContent,
            agentName: "orchestrator",
            timestamp: new Date().toISOString(),
          };
          yield { type: "done", data: { message: assistantMessage } };
          return;
        }

        // Process delegation tool calls
        for (const toolCall of toolCalls) {
          const factory = DELEGATE_MAP[toolCall.name];

          if (!factory) {
            // Unknown delegation tool — append error and continue loop
            llmMessages.push({
              role: "assistant",
              content: fullContent,
              toolCalls: [toolCall],
            });
            llmMessages.push({
              role: "tool",
              content: JSON.stringify({
                error: `Unknown delegation tool: ${toolCall.name}`,
              }),
              toolCallId: toolCall.id,
            });
            continue;
          }

          const subAgent = factory();
          const task = (toolCall.arguments as { task?: string }).task ?? "";

          yield {
            type: "agent_switch",
            data: { from: "orchestrator", to: subAgent.name },
          };

          // Build a sub-context: inject the delegation task as a user message
          const subContext: AgentContext = {
            env: context.env,
            conversationId: context.conversationId,
            messages: [
              // Carry over conversation history for context
              ...context.messages,
              // Add the delegation task
              {
                id: crypto.randomUUID(),
                role: "user",
                content: task,
                timestamp: new Date().toISOString(),
              },
            ],
            abortSignal: context.abortSignal,
          };

          // Stream the sub-agent's events through
          let subAgentResult = "";
          for await (const subEvent of runAgent(
            subAgent,
            subContext,
            provider,
          )) {
            // Pass through all events except "done" — we capture that
            if (subEvent.type === "done") {
              subAgentResult = subEvent.data.message.content;
            } else {
              yield subEvent;
            }
          }

          // Feed the sub-agent result back as a tool response
          llmMessages.push({
            role: "assistant",
            content: fullContent,
            toolCalls: [toolCall],
          });
          llmMessages.push({
            role: "tool",
            content: subAgentResult,
            toolCallId: toolCall.id,
          });

          // Reset for next iteration so orchestrator can summarize or delegate again
          fullContent = "";
        }
      }

      // Max iterations reached
      yield {
        type: "error",
        data: {
          message: "Orchestrator reached maximum iterations",
          code: "MAX_ITERATIONS",
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chatMessageToLLM(msg: ChatMessage): LLMMessage {
  if (msg.role === "tool" && msg.toolResults?.length) {
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
