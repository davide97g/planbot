import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { HashIcon } from "lucide-react";
import type { SlackChannel } from "@/hooks/useSlackChannels";

interface ChannelPopoverProps {
  channels: SlackChannel[];
  isLoading: boolean;
  onSelect: (channel: SlackChannel) => void;
}

export function ChannelPopover({
  channels,
  isLoading,
  onSelect,
}: ChannelPopoverProps) {
  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-72">
      <Command className="rounded-lg border border-border shadow-lg">
        <CommandList className="max-h-[calc(8*2.5rem)]">
          {isLoading && channels.length === 0 && (
            <div className="p-2 space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          )}
          {!isLoading && channels.length === 0 && (
            <CommandEmpty>No channels found</CommandEmpty>
          )}
          {channels.length > 0 && (
            <CommandGroup>
              {channels.map((channel) => (
                <CommandItem
                  key={channel.id}
                  onSelect={() => onSelect(channel)}
                  className="flex items-center gap-2"
                >
                  <HashIcon className="size-3.5 text-muted-foreground" />
                  <span className="truncate font-medium">{channel.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
