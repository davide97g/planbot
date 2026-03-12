import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { StreamingMessage } from "./StreamingMessage";
import { PlanBotLogo } from "./PlanBotLogo";
import type { ChatMessage } from "@/hooks/useChat";

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground min-h-0">
        <PlanBotLogo className="size-16 opacity-30 rounded-2xl" />
        <p className="text-lg font-medium">How can I help you today?</p>
        <p className="text-sm">
          Ask a question, search Jira issues, or generate a plan.
        </p>
      </div>
    );
  }

  // Identify streaming message: last assistant message while streaming
  const lastMsg = messages[messages.length - 1];
  const streamingMsg =
    isStreaming && lastMsg?.role === "assistant" ? lastMsg : null;
  const displayMessages = streamingMsg
    ? messages.slice(0, -1)
    : messages;

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl py-4">
        {displayMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {streamingMsg && <StreamingMessage message={streamingMsg} />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
