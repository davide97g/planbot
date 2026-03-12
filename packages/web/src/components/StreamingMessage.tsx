import { ToolCallCard } from "./ToolCallCard";
import { Markdown } from "./Markdown";
import type { ChatMessage, ContentBlock } from "@/hooks/useChat";

interface StreamingMessageProps {
  message: ChatMessage;
}

export function StreamingMessage({ message }: StreamingMessageProps) {
  const blocks = message.blocks ?? [];
  const hasBlocks = blocks.length > 0;
  const isThinking = !hasBlocks;

  return (
    <div className="px-4 py-3">
      {message.agentName && (
        <div className="mb-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {message.agentName}
          </span>
        </div>
      )}
      {isThinking && (
        <p className="shimmer-text text-sm">Thinking...</p>
      )}
      {blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} isLast={i === blocks.length - 1} />
      ))}
    </div>
  );
}

function BlockRenderer({ block, isLast }: { block: ContentBlock; isLast: boolean }) {
  if (block.type === "tool_call") {
    return (
      <div className="my-1">
        <ToolCallCard toolCall={block.toolCall} />
      </div>
    );
  }

  return (
    <div className="text-sm leading-relaxed my-1">
      <Markdown content={block.content} />
      {isLast && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-foreground/70 align-text-bottom" />
      )}
    </div>
  );
}
