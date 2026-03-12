import { ToolCallCard } from "./ToolCallCard";
import { Markdown } from "./Markdown";
import { ResourceChip, parseResourceTags } from "./ResourceChip";
import { CoinsIcon, FileIcon } from "lucide-react";
import type { ChatMessage, ContentBlock } from "@/hooks/useChat";

interface ConfluenceUrlChip {
  url: string;
  title: string;
}

/** Extract Confluence URLs from text and convert them to chips with a readable title */
function extractConfluenceUrls(text: string): { chips: ConfluenceUrlChip[]; remainingText: string } {
  const chips: ConfluenceUrlChip[] = [];
  const confluenceUrlRegex = /https?:\/\/[^\s]+\.atlassian\.net\/wiki\/[^\s]+/g;
  let remaining = text;
  let match;

  while ((match = confluenceUrlRegex.exec(text)) !== null) {
    const url = match[0];
    // Extract page title from URL: last path segment, decode + and %xx
    const segments = url.replace(/[?#].*$/, "").split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] || "Page";
    const title = decodeURIComponent(lastSegment).replace(/\+/g, " ");
    chips.push({ url, title });
    remaining = remaining.replace(url, "").trim();
  }

  return { chips, remainingText: remaining };
}

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    const { tags, cleanText } = parseResourceTags(message.content);
    const { chips: urlChips, remainingText } = extractConfluenceUrls(cleanText);

    return (
      <div className="flex justify-end gap-2 px-4 py-2">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm border-2 border-border px-4 py-2 text-foreground text-sm overflow-hidden">
          {(tags.length > 0 || urlChips.length > 0) && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <ResourceChip key={tag.id} abbrev={tag.abbrev} id={tag.id} title={tag.title} />
              ))}
              {urlChips.map((chip) => (
                <ResourceChip key={chip.url} abbrev="C" id={chip.url} title={chip.title} />
              ))}
            </div>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {message.attachments.map((att: { id: string; name: string; mimeType: string; previewUrl?: string }) => (
                att.previewUrl ? (
                  <img
                    key={att.id}
                    src={att.previewUrl}
                    alt={att.name}
                    className="h-40 max-w-full rounded-lg object-cover border border-border"
                  />
                ) : (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs"
                  >
                    <FileIcon className="size-3 text-muted-foreground" />
                    <span className="max-w-[120px] truncate">{att.name}</span>
                  </span>
                )
              ))}
            </div>
          )}
          {remainingText && <p className="whitespace-pre-wrap break-words">{remainingText}</p>}
        </div>
      </div>
    );
  }

  // Assistant message — interleaved blocks
  const blocks = message.blocks;
  const hasBlocks = blocks && blocks.length > 0;

  return (
    <div className="px-4 py-3">
      {message.agentName && (
        <div className="mb-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {message.agentName}
          </span>
        </div>
      )}
      {hasBlocks ? (
        blocks.map((block, i) => (
          <CompletedBlock key={i} block={block} />
        ))
      ) : (
        <>
          {/* Fallback for older messages without blocks */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-2">
              {message.toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} toolCall={tc} />
              ))}
            </div>
          )}
          {message.content && (
            <div className="text-sm leading-relaxed">
              <Markdown content={message.content} />
            </div>
          )}
        </>
      )}
      {/* Token usage */}
      {message.tokenUsage && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground/50">
          <CoinsIcon className="size-2.5" />
          <span>{message.tokenUsage.totalTokens.toLocaleString()} tokens</span>
          <span className="text-muted-foreground/30">
            ({message.tokenUsage.promptTokens.toLocaleString()}&uarr; {message.tokenUsage.completionTokens.toLocaleString()}&darr;)
          </span>
        </div>
      )}
    </div>
  );
}

function CompletedBlock({ block }: { block: ContentBlock }) {
  if (block.type === "tool_call") {
    return (
      <div className="my-1">
        <ToolCallCard toolCall={block.toolCall} />
      </div>
    );
  }

  if (!block.content.trim()) return null;

  return (
    <div className="text-sm leading-relaxed my-1">
      <Markdown content={block.content} />
    </div>
  );
}
