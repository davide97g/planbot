import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import type { MentionResult } from "@/hooks/useMentions";
import { FileTextIcon, TicketIcon } from "lucide-react";

interface MentionPopoverProps {
  results: MentionResult[];
  isSearching: boolean;
  onSelect: (result: MentionResult) => void;
}

export function MentionPopover({
  results,
  isSearching,
  onSelect,
}: MentionPopoverProps) {
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-80">
      <Command className="rounded-lg border border-border shadow-lg">
        <CommandList>
          {isSearching && results.length === 0 && (
            <div className="p-2 space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          )}
          {!isSearching && results.length === 0 && (
            <CommandEmpty>No results found</CommandEmpty>
          )}
          {results.length > 0 && (
            <CommandGroup>
              {results.map((result) => (
                <CommandItem
                  key={`${result.type}-${result.id}`}
                  onSelect={() => onSelect(result)}
                  className="flex items-center gap-2"
                >
                  {result.type === "jira" ? (
                    <TicketIcon className="size-3.5 text-muted-foreground" />
                  ) : (
                    <FileTextIcon className="size-3.5 text-muted-foreground" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="truncate font-medium">
                      {result.display}
                    </span>
                    {result.summary && (
                      <span className="truncate text-xs text-muted-foreground">
                        {result.summary}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
