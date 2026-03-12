import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import type { SprintSuggestion } from "@/hooks/useSprintSuggestions";
import { ZapIcon } from "lucide-react";

interface SprintPopoverProps {
  sprints: SprintSuggestion[];
  isLoading: boolean;
  onSelect: (sprint: SprintSuggestion) => void;
}

export function SprintPopover({ sprints, isLoading, onSelect }: SprintPopoverProps) {
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-80">
      <Command className="rounded-lg border border-border shadow-lg">
        <CommandList className="max-h-[calc(8*2.5rem)]">
          {isLoading && sprints.length === 0 && (
            <div className="p-2 space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          )}
          {!isLoading && sprints.length === 0 && (
            <CommandEmpty>No sprints found</CommandEmpty>
          )}
          {sprints.length > 0 && (
            <CommandGroup>
              {sprints.map((sprint) => (
                <CommandItem
                  key={sprint.id}
                  onSelect={() => onSelect(sprint)}
                  className="flex items-center gap-2"
                >
                  <ZapIcon
                    className={`size-3.5 ${
                      sprint.state === "active"
                        ? "text-green-500"
                        : "text-muted-foreground"
                    }`}
                  />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{sprint.name}</span>
                      {sprint.state === "active" && (
                        <span className="shrink-0 rounded bg-green-500/15 px-1.5 py-0 text-[10px] font-medium text-green-600">
                          active
                        </span>
                      )}
                    </div>
                    {sprint.boardName && (
                      <span className="truncate text-xs text-muted-foreground">
                        {sprint.boardName}
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
