import { useState } from "react";
import {
  ChevronRightIcon,
  CheckIcon,
  XIcon,
  SearchIcon,
  FileTextIcon,
  BarChartIcon,
  UsersIcon,
  WrenchIcon,
  RouteIcon,
  TicketIcon,
  BookOpenIcon,
} from "lucide-react";
import type { ToolCall } from "@/hooks/useChat";

const TOOL_LABELS: Record<string, { label: string; icon: typeof SearchIcon }> = {
  // Jira tools
  search_jira_issues: { label: "Searching Jira issues", icon: SearchIcon },
  get_issue: { label: "Retrieving Jira issue", icon: FileTextIcon },
  search_by_version: { label: "Searching by version", icon: SearchIcon },
  get_active_sprint: { label: "Getting active sprint", icon: BarChartIcon },
  // Confluence tools
  search_confluence_pages: { label: "Searching Confluence", icon: SearchIcon },
  get_confluence_page: { label: "Retrieving Confluence page", icon: FileTextIcon },
  // Team/capacity tools
  get_team_capacity: { label: "Getting team capacity", icon: UsersIcon },
  list_teams: { label: "Listing teams", icon: UsersIcon },
  // Planning/reporting tools
  generate_plan: { label: "Generating plan", icon: BarChartIcon },
  generate_excel_report: { label: "Generating report", icon: BarChartIcon },
  // Orchestrator delegation tools
  delegate_planning: { label: "Delegating to planner", icon: RouteIcon },
  delegate_jira: { label: "Delegating to Jira agent", icon: TicketIcon },
  delegate_confluence: { label: "Delegating to Confluence agent", icon: BookOpenIcon },
  delegate_reporting: { label: "Delegating to reporter", icon: RouteIcon },
};

function getToolLabel(name: string): { label: string; icon: typeof SearchIcon } {
  return TOOL_LABELS[name] || { label: name.replace(/_/g, " "), icon: WrenchIcon };
}

function getToolContext(toolCall: ToolCall): string | null {
  const args = toolCall.arguments;
  // Show the first meaningful argument value
  const firstValue = Object.values(args).find((v) => typeof v === "string" && v.length > 0);
  if (typeof firstValue === "string") {
    return firstValue.length > 60 ? firstValue.slice(0, 60) + "..." : firstValue;
  }
  return null;
}

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isPending = toolCall.result === undefined;
  const isError = toolCall.isError;
  const { label, icon: Icon } = getToolLabel(toolCall.name);
  const context = getToolContext(toolCall);

  return (
    <div className="my-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50"
      >
        {isPending ? (
          <Icon className="size-3.5 shrink-0 animate-pulse text-muted-foreground" />
        ) : isError ? (
          <XIcon className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <CheckIcon className="size-3.5 shrink-0 text-emerald-500" />
        )}
        <span className={isPending ? "shimmer-text" : "text-muted-foreground"}>
          {label}
        </span>
        {context && (
          <>
            <span className="text-muted-foreground/50">&middot;</span>
            <code className="truncate text-xs text-muted-foreground/70 font-mono">
              {context}
            </code>
          </>
        )}
        <ChevronRightIcon
          className={`ml-auto size-3.5 shrink-0 text-muted-foreground/50 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && (
        <div className="ml-6 mt-1 space-y-2 text-xs">
          {Object.keys(toolCall.arguments).length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">Input</span>
              <pre className="mt-0.5 overflow-x-auto rounded bg-muted/50 p-2 font-mono text-muted-foreground">
                {JSON.stringify(toolCall.arguments, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result !== undefined && (
            <div>
              <span className="font-medium text-muted-foreground">Output</span>
              <pre className="mt-0.5 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-muted-foreground">
                {typeof toolCall.result === "string"
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
