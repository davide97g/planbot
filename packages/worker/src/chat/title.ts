import type { ChatMessage } from "../types";

/**
 * Generate a short conversation title using gpt-4o-mini.
 * Returns the trimmed title string, or null on any error.
 * Never throws.
 */
export async function generateConversationTitle(
  messages: ChatMessage[],
  apiKey: string,
): Promise<string | null> {
  try {
    const recent = messages.slice(-10);

    const chatMessages = [
      {
        role: "system",
        content:
          "You are a conversation titler. Given the following chat messages, produce a concise title of at most 6 words that captures the main topic. Reply with only the title, no punctuation, no quotes.",
      },
      ...recent
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: chatMessages,
        max_tokens: 20,
        temperature: 0.3,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const title = data.choices?.[0]?.message?.content?.trim();
    return title || null;
  } catch {
    return null;
  }
}
