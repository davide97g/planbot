import { useState, useRef, useCallback } from "react";
import type { Task } from "@/hooks/useTaskStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PlusIcon,
  Trash2Icon,
  GripVerticalIcon,
  CheckIcon,
  SparklesIcon,
  ExternalLinkIcon,
  Maximize2Icon,
  Minimize2Icon,
  SearchIcon,
  LoaderIcon,
} from "lucide-react";
import { useUnifiedSearch, type UnifiedSearchResult } from "@/hooks/useUnifiedSearch";
import type { TaggedResource } from "./ResourceChip";
import type { SlackChannel } from "@/hooks/useSlackChannels";

interface WorkspaceLinks {
  jiraBoard: { id: number; name: string; url: string } | null;
  confluenceUrl: string | null;
}

interface TaskSidebarProps {
  tasks: Task[];
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onClearCompleted: () => void;
  workspace?: WorkspaceLinks;
  onResourceSelect: (resource: TaggedResource) => void;
  slackChannels: SlackChannel[];
}

type ExpandedSection = null | "search" | "tasks";

const SOURCE_LABELS: Record<string, string> = {
  jira: "Jira",
  confluence: "Confluence",
  slack: "Slack",
  memory: "Memory",
  sprint: "Sprint",
};

const SOURCE_BADGE_STYLE: Record<string, string> = {
  jira: "bg-blue-600 text-white",
  confluence: "bg-sky-600 text-white",
  slack: "bg-purple-700 text-white",
  memory: "bg-amber-600 text-white",
  sprint: "bg-violet-600 text-white",
};

const DEFAULT_TASK_COUNT = 5;

function getJiraAbbrev(issueType?: string): string {
  if (!issueType) return "T";
  const lower = issueType.toLowerCase();
  if (lower === "story") return "S";
  if (lower === "bug") return "B";
  if (lower === "task") return "T";
  if (lower === "sub-task") return "ST";
  if (lower === "epic") return "E";
  return issueType.charAt(0).toUpperCase();
}

function resultToTaggedResource(result: UnifiedSearchResult): TaggedResource {
  switch (result.sourceType) {
    case "jira":
      return { id: result.id, resourceType: "jira", issueType: result.issueType ?? "task", display: result.display };
    case "confluence":
      return { id: result.id, resourceType: "confluence", display: result.display };
    case "slack":
      return { id: result.id, resourceType: "slack", display: result.display };
    case "memory":
      return { id: result.id, resourceType: "memory", display: result.display };
    case "sprint":
      return { id: result.id, resourceType: "sprint", display: result.display };
  }
}

export function TaskSidebar({
  tasks,
  onAdd,
  onToggle,
  onDelete,
  onReorder,
  onClearCompleted,
  workspace,
  onResourceSelect,
  slackChannels,
}: TaskSidebarProps) {
  const [newTitle, setNewTitle] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [focusedResultIndex, setFocusedResultIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const unifiedSearch = useUnifiedSearch(slackChannels);

  const completedCount = tasks.filter((t) => t.done).length;
  const hiddenCount = tasks.length > DEFAULT_TASK_COUNT ? tasks.length - DEFAULT_TASK_COUNT : 0;
  const visibleTasks = showAllTasks ? tasks : tasks.slice(0, DEFAULT_TASK_COUNT);

  const handleAdd = useCallback(() => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewTitle("");
    inputRef.current?.focus();
  }, [newTitle, onAdd]);

  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = Number(e.dataTransfer.getData("text/plain"));
      if (!isNaN(fromIndex) && fromIndex !== toIndex) {
        onReorder(fromIndex, toIndex);
      }
      setDragIndex(null);
      setDropIndex(null);
    },
    [onReorder],
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      unifiedSearch.search(e.target.value);
      setFocusedResultIndex(-1);
    },
    [unifiedSearch],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const resultCount = unifiedSearch.results.length;

      if (e.key === "Escape") {
        unifiedSearch.clear();
        setFocusedResultIndex(-1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedResultIndex((i) => Math.min(i + 1, resultCount - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedResultIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && resultCount > 0) {
        e.preventDefault();
        const idx = focusedResultIndex >= 0 ? focusedResultIndex : 0;
        const result = unifiedSearch.results[idx];
        if (result) {
          selectResult(result);
        }
        return;
      }
    },
    [unifiedSearch, focusedResultIndex],
  );

  const selectResult = useCallback(
    (result: UnifiedSearchResult) => {
      onResourceSelect(resultToTaggedResource(result));
      unifiedSearch.clear();
      setFocusedResultIndex(-1);
    },
    [onResourceSelect, unifiedSearch],
  );

  const toggleExpand = (section: "search" | "tasks") => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const isSearchExpanded = expandedSection === "search";
  const isTasksExpanded = expandedSection === "tasks";

  // Section height classes
  const searchSectionClass = isSearchExpanded
    ? "flex-1 flex flex-col overflow-hidden border-b border-border"
    : isTasksExpanded
    ? "flex-none border-b border-border"
    : "flex-none border-b border-border";

  const tasksSectionClass = isTasksExpanded
    ? "flex-1 flex flex-col overflow-hidden"
    : isSearchExpanded
    ? "flex-none"
    : "flex-none";

  return (
    <div className="flex h-full w-[300px] flex-col border-l border-border bg-card">

      {/* ── Search section ─────────────────────────────────── */}
      <div className={searchSectionClass}>
        {/* Search header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Search</h2>
          <button
            onClick={() => toggleExpand("search")}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={isSearchExpanded ? "Collapse" : "Expand"}
          >
            {isSearchExpanded ? (
              <Minimize2Icon className="h-3.5 w-3.5" />
            ) : (
              <Maximize2Icon className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <SearchIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={unifiedSearch.query}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search Jira, Confluence, Slack…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {unifiedSearch.isSearching && (
            <LoaderIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0 animate-spin" />
          )}
          {unifiedSearch.query && !unifiedSearch.isSearching && (
            <button
              onClick={() => unifiedSearch.clear()}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="text-xs">✕</span>
            </button>
          )}
        </div>

        {/* Search results */}
        {(isSearchExpanded || (!isTasksExpanded && unifiedSearch.query)) && (
          <div
            className={`overflow-y-auto ${
              isSearchExpanded ? "flex-1" : "max-h-[200px]"
            }`}
          >
            {unifiedSearch.query.trim().length < 2 && (
              <p className="px-4 py-3 text-center text-xs text-muted-foreground">
                Type at least 2 characters
              </p>
            )}
            {unifiedSearch.query.trim().length >= 2 &&
              !unifiedSearch.isSearching &&
              unifiedSearch.results.length === 0 && (
                <p className="px-4 py-3 text-center text-xs text-muted-foreground">
                  No results found
                </p>
              )}
            {unifiedSearch.results.length > 0 && (
              <div className="py-1">
                {/* Group results by sourceType */}
                {(["jira", "confluence", "slack", "memory", "sprint"] as const).map((sourceType) => {
                  const group = unifiedSearch.results.filter(
                    (r) => r.sourceType === sourceType,
                  );
                  if (group.length === 0) return null;
                  return (
                    <div key={sourceType}>
                      <div className="px-3 py-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {SOURCE_LABELS[sourceType]}
                        </span>
                      </div>
                      {group.map((result) => {
                        const globalIdx = unifiedSearch.results.indexOf(result);
                        return (
                          <button
                            key={`${result.sourceType}:${result.id}`}
                            onClick={() => selectResult(result)}
                            onMouseEnter={() => setFocusedResultIndex(globalIdx)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                              focusedResultIndex === globalIdx
                                ? "bg-accent"
                                : "hover:bg-accent/50"
                            }`}
                          >
                            <span
                              className={`inline-flex h-4 w-auto min-w-4 shrink-0 items-center justify-center rounded px-1 text-[9px] font-bold leading-none ${
                                SOURCE_BADGE_STYLE[result.sourceType]
                              }`}
                            >
                              {result.sourceType === "jira"
                                ? getJiraAbbrev(result.issueType)
                                : result.sourceType === "slack"
                                ? "#"
                                : result.sourceType === "memory"
                                ? "M"
                                : result.sourceType === "sprint"
                                ? "SP"
                                : "C"}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-xs text-foreground font-medium">
                                {result.sourceType === "jira" && (
                                  <span className="text-muted-foreground font-mono mr-1">{result.id}</span>
                                )}
                                {result.display}
                              </span>
                              {result.subtext && (
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {result.subtext}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tasks section ──────────────────────────────────── */}
      <div className={tasksSectionClass}>
        {/* Tasks header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {tasks.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {completedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearCompleted}
                className="h-auto px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                Clear done
              </Button>
            )}
            <button
              onClick={() => toggleExpand("tasks")}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title={isTasksExpanded ? "Collapse" : "Expand"}
            >
              {isTasksExpanded ? (
                <Minimize2Icon className="h-3.5 w-3.5" />
              ) : (
                <Maximize2Icon className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Add task input */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleAddKeyDown}
            placeholder="Add a task..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleAdd}
            disabled={!newTitle.trim()}
            className="h-7 w-7 shrink-0"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Task list */}
        {(isTasksExpanded || !isSearchExpanded) && (
          <div className={`overflow-y-auto ${isTasksExpanded ? "flex-1" : ""}`}>
            {tasks.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                No tasks yet
              </p>
            )}
            {visibleTasks.map((task, index) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onDrop={(e) => handleDrop(e, index)}
                className={`group relative flex items-center gap-2 px-3 py-2 transition-opacity ${
                  dragIndex === index ? "opacity-50" : ""
                } ${
                  dropIndex === index && dragIndex !== null && dragIndex !== index
                    ? "border-t-2 border-primary"
                    : "border-t-2 border-transparent"
                }`}
              >
                <div className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
                  <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <button
                  onClick={() => onToggle(task.id)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
                    task.done
                      ? "border-primary bg-primary"
                      : "border-border hover:border-muted-foreground"
                  }`}
                >
                  {task.done && <CheckIcon className="h-3 w-3 text-primary-foreground" />}
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span
                    className={`truncate text-sm ${
                      task.done ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    {task.title}
                  </span>
                  {task.createdBy === "ai" && (
                    <Badge
                      variant="secondary"
                      className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-0 text-[10px] leading-tight text-muted-foreground"
                    >
                      <SparklesIcon className="h-2.5 w-2.5" />
                      AI
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(task.id)}
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2Icon className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
            {!showAllTasks && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllTasks(true)}
                className="w-full px-4 py-2 text-center text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
              >
                +{hiddenCount} more task{hiddenCount > 1 ? "s" : ""}
              </button>
            )}
            {showAllTasks && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllTasks(false)}
                className="w-full px-4 py-2 text-center text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Workspace links (always visible) ──────────────── */}
      {workspace && (workspace.jiraBoard || workspace.confluenceUrl) && (
        <div className="flex flex-col gap-1 border-t border-border px-3 py-2 mt-auto">
          {workspace.jiraBoard && (
            <a
              href={workspace.jiraBoard.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.218a5.218 5.218 0 0 0 5.215 5.22h2.129v2.053a5.217 5.217 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.005-1.001zm5.711-5.757H10.949a5.215 5.215 0 0 0 5.215 5.22h2.129v2.054A5.218 5.218 0 0 0 23.509 12.5V1.005A1.005 1.005 0 0 0 22.504 0z" />
              </svg>
              <span className="truncate font-medium">{workspace.jiraBoard.name}</span>
              <ExternalLinkIcon className="size-3 shrink-0 ml-auto opacity-50" />
            </a>
          )}
          {workspace.confluenceUrl && (
            <a
              href={workspace.confluenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <svg className="size-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.87 18.257c-.248.382-.53.875-.763 1.245a.764.764 0 0 0 .255 1.04l4.965 3.054a.764.764 0 0 0 1.058-.26c.199-.332.49-.86.764-1.32 1.444-2.426 2.921-2.13 5.572-.874l4.984 2.394a.764.764 0 0 0 1.028-.382l2.39-5.248a.764.764 0 0 0-.382-1.017C18.21 15.862 9.36 11.357.87 18.257zM23.131 5.743c.249-.382.53-.875.764-1.245a.764.764 0 0 0-.256-1.04L18.674.404a.764.764 0 0 0-1.058.26c-.199.332-.49.86-.764 1.32-1.444 2.426-2.921 2.13-5.572.874L6.296.464a.764.764 0 0 0-1.028.382L2.878 6.094a.764.764 0 0 0 .382 1.017c2.527 1.227 11.377 5.732 19.871-1.368z" />
              </svg>
              <span className="truncate font-medium">Confluence</span>
              <ExternalLinkIcon className="size-3 shrink-0 ml-auto opacity-50" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
