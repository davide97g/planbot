import type { Agent, AgentContext, SSEEvent, ToolDefinition } from "../types";
import { allToolDefinitions } from "../tools";
import { createLLMProvider } from "./llm-provider";
import { runAgent } from "./runner";

const CONFLUENCE_TOOLS = [
  "search_confluence_pages",
  "get_confluence_page",
];

const SYSTEM_PROMPT = `You are PlanBot's Confluence Agent, a specialist in documentation search and summarization.

Your capabilities:
- Search Confluence pages by keywords and labels
- Retrieve and read full page content (by title or URL)
- Summarize and extract key information from documentation

When a user provides a Confluence URL, pass the full URL to the get_confluence_page tool — it will extract the page ID automatically.

When searching for documentation:
- Use relevant keywords and try multiple search strategies if initial results are sparse
- For CQL searches, use text search: text ~ "keyword" OR title ~ "keyword"
- Look for project specs, architecture docs, meeting notes, and decision records
- Summarize findings concisely, highlighting the most relevant sections

When presenting results:
- Provide page titles and brief summaries
- Quote key sections when they directly answer the question
- Note when information may be outdated based on page update dates
- Suggest related pages that might also be relevant`;

export function createConfluenceAgent(): Agent {
  const tools: ToolDefinition[] = allToolDefinitions.filter((t) =>
    CONFLUENCE_TOOLS.includes(t.name),
  );

  return {
    name: "confluence",
    description: "Searches and summarizes Confluence documentation",
    systemPrompt: SYSTEM_PROMPT,
    tools,
    async *run(context: AgentContext): AsyncIterable<SSEEvent> {
      const provider = createLLMProvider(context.env);
      yield* runAgent(this, context, provider);
    },
  };
}
