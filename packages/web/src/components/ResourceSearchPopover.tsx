import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { ResourceResult } from "@/hooks/useResourceSearch";
import { FileTextIcon, SearchIcon, LinkIcon } from "lucide-react";

interface ResourceSearchPopoverProps {
  resourceType: "jira" | "confluence";
  query: string;
  results: ResourceResult[];
  isSearching: boolean;
  isUrlQuery: boolean;
  onSelect: (result: ResourceResult) => void;
}

const ISSUE_TYPE_BADGE: Record<string, { letter: string; className: string }> = {
  story: { letter: "S", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  bug: { letter: "B", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  task: { letter: "T", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  "sub-task": { letter: "ST", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  epic: { letter: "E", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
};

function getIssueTypeBadge(issueType: string): { letter: string; className: string } {
  return (
    ISSUE_TYPE_BADGE[issueType.toLowerCase()] ?? {
      letter: issueType.charAt(0).toUpperCase(),
      className: "bg-muted text-muted-foreground",
    }
  );
}

export function ResourceSearchPopover({
  resourceType,
  query,
  results,
  isSearching,
  isUrlQuery,
  onSelect,
}: ResourceSearchPopoverProps) {
  const label = resourceType === "jira" ? "Jira Issues" : "Confluence Pages";

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-[32rem]">
      <Command className="rounded-lg border border-border shadow-lg">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          {isUrlQuery ? (
            <LinkIcon className="size-3.5 text-muted-foreground" />
          ) : (
            <SearchIcon className="size-3.5 text-muted-foreground" />
          )}
          <span className="text-sm text-muted-foreground">
            {isUrlQuery ? `Fetching ${label.slice(0, -1)}...` : `Search ${label}`}
          </span>
          {query && !isUrlQuery && (
            <Badge variant="secondary" className="ml-auto max-w-48 truncate text-xs">
              {query}
            </Badge>
          )}
        </div>
        <CommandList>
          {isSearching && results.length === 0 && (
            <div className="p-2 space-y-2">
              <Skeleton className="h-10 w-full" />
              {!isUrlQuery && <Skeleton className="h-10 w-full" />}
              {!isUrlQuery && <Skeleton className="h-10 w-3/4" />}
            </div>
          )}
          {!isSearching && query.length >= 2 && results.length === 0 && (
            <CommandEmpty>No {resourceType} results found</CommandEmpty>
          )}
          {!isSearching && query.length < 2 && results.length === 0 && (
            <div className="p-3 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </div>
          )}
          {results.length > 0 && (
            <CommandGroup>
              {results.map((result) => (
                <CommandItem
                  key={`${result.id}`}
                  onSelect={() => onSelect(result)}
                  className="flex items-center gap-2 py-2"
                >
                  {resourceType === "jira" && result.issueType ? (
                    <JiraResultRow result={result} />
                  ) : (
                    <ConfluenceResultRow result={result} />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}

function JiraResultRow({ result }: { result: ResourceResult }) {
  const badge = getIssueTypeBadge(result.issueType!);
  return (
    <>
      <span
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold leading-none ${badge.className}`}
      >
        {badge.letter}
      </span>
      <span className="shrink-0 text-xs font-mono text-muted-foreground">
        {result.id}
      </span>
      <span className="truncate text-sm">{result.display}</span>
      {result.status && (
        <Badge
          variant="outline"
          className="ml-auto shrink-0 text-[10px] uppercase tracking-wide"
        >
          {result.status}
        </Badge>
      )}
    </>
  );
}

function ConfluenceResultRow({ result }: { result: ResourceResult }) {
  return (
    <>
      <FileTextIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex flex-col min-w-0 gap-0.5">
        <span className="truncate font-medium text-sm">{result.display}</span>
        {result.summary && (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {result.summary}
          </span>
        )}
      </div>
    </>
  );
}
