import { useState, useRef, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { MentionPopover } from "./MentionPopover";
import { ResourceSearchPopover } from "./ResourceSearchPopover";
import { ChannelPopover } from "./ChannelPopover";
import {
  ResourceChip,
  encodeResourceTag,
  type TaggedResource,
} from "./ResourceChip";
import { useSlashCommands } from "@/hooks/useSlashCommands";
import { useMentions } from "@/hooks/useMentions";
import { useResourceSearch } from "@/hooks/useResourceSearch";
import type { ResourceResult } from "@/hooks/useResourceSearch";
import type { Task } from "@/hooks/useTaskStore";
import type { UseSlackChannelsReturn } from "@/hooks/useSlackChannels";
import { SendIcon } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  isStreaming: boolean;
  tasks?: Task[];
  slackChannels?: UseSlackChannelsReturn;
}

export function ChatInput({ onSend, isStreaming, tasks = [], slackChannels }: ChatInputProps) {
  const [value, setValue] = useState("");
  const [taggedResources, setTaggedResources] = useState<TaggedResource[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashCommands();
  const mentions = useMentions();
  const resourceSearch = useResourceSearch();
  const [showMentions, setShowMentions] = useState(false);
  const [showChannels, setShowChannels] = useState(false);
  const [channelResults, setChannelResults] = useState<{ id: string; name: string }[]>([]);
  const [showTaskMentions, setShowTaskMentions] = useState(false);
  const [taskResults, setTaskResults] = useState<Task[]>([]);

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text && taggedResources.length === 0) return;
    if (isStreaming) return;

    const tagTokens = taggedResources.map(encodeResourceTag);
    const parts = [...tagTokens, text].filter(Boolean);
    onSend(parts.join(" "));

    setValue("");
    setTaggedResources([]);
    slash.deactivate();
    mentions.clear();
    resourceSearch.dismiss();
    setShowMentions(false);
    setShowChannels(false);
    setShowTaskMentions(false);
  }, [value, taggedResources, isStreaming, onSend, slash, mentions, resourceSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Resource search: Tab selects first result
    if (resourceSearch.isActive && e.key === "Tab") {
      e.preventDefault();
      if (resourceSearch.results.length > 0) {
        selectResource(resourceSearch.results[0]);
      }
      return;
    }

    // Slash command navigation
    if (slash.isActive && !resourceSearch.isActive) {
      if (e.key === "Tab") {
        e.preventDefault();
        const text = slash.autocomplete();
        if (text) {
          setValue(text);
          resourceSearch.update(text);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        slash.moveSelection("down");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        slash.moveSelection("up");
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const text = slash.autocomplete();
        if (text) {
          setValue(text);
          resourceSearch.update(text);
        }
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      slash.deactivate();
      mentions.clear();
      resourceSearch.dismiss();
      setShowMentions(false);
      setShowChannels(false);
      setShowTaskMentions(false);
    }
    if (e.key === "Backspace" && value === "" && taggedResources.length > 0) {
      setTaggedResources((prev) => prev.slice(0, -1));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);

    // Resource search detection: `/jira <query>` or `/confluence <query>`
    resourceSearch.update(newValue);

    // Slash command detection: only when typing the command itself (no space yet)
    if (
      newValue.startsWith("/") &&
      !newValue.includes(" ") &&
      !resourceSearch.isActive
    ) {
      slash.activate(newValue);
    } else if (!resourceSearch.isActive) {
      slash.deactivate();
    } else {
      slash.deactivate();
    }

    // Channel detection: # followed by text
    if (!resourceSearch.isActive) {
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursorPos);
      const channelMatch = textBeforeCursor.match(/#(\w*)$/);
      if (channelMatch && slackChannels) {
        const query = channelMatch[1];
        setShowChannels(true);
        setChannelResults(slackChannels.search(query).slice(0, 8));
        setShowMentions(false);
        setShowTaskMentions(false);
      } else {
        setShowChannels(false);
        setChannelResults([]);
      }
    }

    // Mention / task detection
    if (!resourceSearch.isActive && !showChannels) {
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newValue.slice(0, cursorPos);

      // Task mention: @task: prefix
      const taskMatch = textBeforeCursor.match(/@task:(\w*)$/i);
      if (taskMatch) {
        const query = taskMatch[1].toLowerCase();
        const filtered = query
          ? tasks.filter((t) => t.title.toLowerCase().includes(query))
          : tasks.filter((t) => !t.done);
        setTaskResults(filtered.slice(0, 8));
        setShowTaskMentions(true);
        setShowMentions(false);
        mentions.clear();
      } else {
        setShowTaskMentions(false);
        setTaskResults([]);

        // Regular @ mention
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
        if (mentionMatch) {
          const query = mentionMatch[1];
          if (query.length >= 1) {
            setShowMentions(true);
            mentions.search(query, "jira");
          } else {
            setShowMentions(true);
            mentions.clear();
          }
        } else {
          setShowMentions(false);
          mentions.clear();
        }
      }
    }
  };

  const selectResource = (result: ResourceResult) => {
    setTaggedResources((prev) => {
      if (prev.some((r) => r.id === result.id)) return prev;
      if (result.issueType) {
        return [
          ...prev,
          { id: result.id, resourceType: "jira" as const, issueType: result.issueType, display: result.display },
        ];
      }
      return [
        ...prev,
        { id: result.id, resourceType: "confluence" as const, display: result.display },
      ];
    });
    setValue("");
    resourceSearch.dismiss();
    slash.deactivate();
    textareaRef.current?.focus();
  };

  const handleSlashSelect = (command: string) => {
    const text = slash.selectCommand(command);
    setValue(text);
    resourceSearch.update(text);
    textareaRef.current?.focus();
  };

  const handleMentionSelect = (result: { display: string }) => {
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const replaced = textBeforeCursor.replace(/@\w*$/, `@${result.display} `);
    setValue(replaced + textAfterCursor);
    setShowMentions(false);
    mentions.clear();
    textareaRef.current?.focus();
  };

  const handleChannelSelect = (channel: { id: string; name: string }) => {
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const replaced = textBeforeCursor.replace(/#\w*$/, `#${channel.name} `);
    setValue(replaced + textAfterCursor);
    setShowChannels(false);
    setChannelResults([]);
    textareaRef.current?.focus();
  };

  const handleTaskSelect = (task: Task) => {
    const cursorPos = textareaRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const textAfterCursor = value.slice(cursorPos);
    const replaced = textBeforeCursor.replace(/@task:\w*$/i, `[T:${task.id}:${task.title}] `);
    setValue(replaced + textAfterCursor);
    setShowTaskMentions(false);
    setTaskResults([]);
    textareaRef.current?.focus();
  };

  const removeTaggedResource = (id: string) => {
    setTaggedResources((prev) => prev.filter((r) => r.id !== id));
    textareaRef.current?.focus();
  };

  const getTypeAbbrev = (issueType: string) => {
    const lower = issueType.toLowerCase();
    if (lower === "story") return "S";
    if (lower === "bug") return "B";
    if (lower === "task") return "T";
    if (lower === "sub-task") return "ST";
    if (lower === "epic") return "E";
    return issueType.charAt(0).toUpperCase();
  };

  return (
    <div className="border-t border-border bg-background p-4">
      <div className="relative mx-auto max-w-3xl">
        {slash.isActive && !resourceSearch.isActive && (
          <SlashCommandMenu
            commands={slash.filteredCommands}
            selectedIndex={slash.selectedIndex}
            onSelect={handleSlashSelect}
          />
        )}
        {resourceSearch.isActive && resourceSearch.resourceType && (
          <ResourceSearchPopover
            resourceType={resourceSearch.resourceType}
            query={resourceSearch.query}
            results={resourceSearch.results}
            isSearching={resourceSearch.isSearching}
            isUrlQuery={resourceSearch.isUrlQuery}
            onSelect={selectResource}
          />
        )}
        {showMentions &&
          !resourceSearch.isActive &&
          (mentions.results.length > 0 || mentions.isSearching) && (
            <MentionPopover
              results={mentions.results}
              isSearching={mentions.isSearching}
              onSelect={handleMentionSelect}
            />
          )}
        {showChannels && channelResults.length > 0 && (
          <ChannelPopover
            channels={channelResults}
            isLoading={slackChannels?.isLoading ?? false}
            onSelect={handleChannelSelect}
          />
        )}
        {showTaskMentions && taskResults.length > 0 && (
          <div className="absolute bottom-full left-0 z-50 mb-2 w-80">
            <div className="rounded-lg border border-border bg-popover shadow-lg">
              <div className="p-1">
                {taskResults.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => handleTaskSelect(task)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  >
                    <div
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
                        task.done ? "border-primary bg-primary" : "border-border"
                      }`}
                    />
                    <span className={`truncate ${task.done ? "text-muted-foreground line-through" : ""}`}>
                      {task.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Tagged resource chips */}
        {taggedResources.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {taggedResources.map((r) => (
              <ResourceChip
                key={r.id}
                abbrev={r.resourceType === "confluence" ? "C" : getTypeAbbrev(r.issueType ?? "task")}
                id={r.id}
                title={r.resourceType === "confluence" ? r.display : undefined}
                onRemove={() => removeTaggedResource(r.id)}
              />
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              taggedResources.length > 0
                ? "Add a message or press Enter to send..."
                : "Type a message... (/ commands, @ mentions, # channels)"
            }
            className="min-h-10 max-h-40 resize-none"
            rows={1}
            disabled={isStreaming}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={(!value.trim() && taggedResources.length === 0) || isStreaming}
          >
            <SendIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
