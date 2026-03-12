import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SlashCommand } from "@/hooks/useSlashCommands";
import { SlashIcon } from "lucide-react";

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: string) => void;
}

export function SlashCommandMenu({ commands, selectedIndex, onSelect }: SlashCommandMenuProps) {
  if (commands.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 z-50 mb-2 w-80">
      <Command className="rounded-lg border border-border shadow-lg">
        <CommandList>
          <CommandGroup heading="Commands">
            {commands.map((cmd, index) => (
              <CommandItem
                key={cmd.name}
                onSelect={() => onSelect(cmd.name)}
                className={`flex items-center gap-2 ${index === selectedIndex ? "bg-accent" : ""}`}
                data-selected={index === selectedIndex}
              >
                <SlashIcon className="size-3.5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="font-medium">
                    {cmd.name}
                    {"args" in cmd && cmd.args && (
                      <span className="ml-1 font-normal text-muted-foreground">
                        {cmd.args}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {cmd.description}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
