import { useState, useCallback, useMemo } from "react";

const COMMANDS = [
  {
    name: "/plan",
    description: "Generate a project plan",
    args: "release|sprint|jql <query>",
  },
  { name: "/jira", description: "Search Jira issues", args: "<query>" },
  {
    name: "/confluence",
    description: "Search Confluence pages",
    args: "<query>",
  },
  {
    name: "/report",
    description: "Generate an Excel report",
    args: "<description>",
  },
  { name: "/help", description: "Show available commands" },
] as const;

export type SlashCommand = (typeof COMMANDS)[number];

export interface UseSlashCommandsReturn {
  isActive: boolean;
  filteredCommands: SlashCommand[];
  selectedIndex: number;
  activate: (text: string) => void;
  deactivate: () => void;
  selectCommand: (command: string) => string;
  moveSelection: (direction: "up" | "down") => void;
  /** Autocomplete the currently selected command. Returns the text to set, or null if nothing selected. */
  autocomplete: () => string | null;
}

export function useSlashCommands(): UseSlashCommandsReturn {
  const [isActive, setIsActive] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = useMemo(() => {
    if (!filterText) return [...COMMANDS];
    return COMMANDS.filter((cmd) =>
      cmd.name.toLowerCase().startsWith(filterText.toLowerCase()),
    );
  }, [filterText]);

  const activate = useCallback(
    (text: string) => {
      if (text.startsWith("/")) {
        setIsActive(true);
        setFilterText(text);
        // Reset selection when filter changes, but keep in bounds
        setSelectedIndex((prev) => {
          const filtered = COMMANDS.filter((cmd) =>
            cmd.name.toLowerCase().startsWith(text.toLowerCase()),
          );
          return prev >= filtered.length ? 0 : prev;
        });
      } else {
        setIsActive(false);
        setFilterText("");
        setSelectedIndex(0);
      }
    },
    [],
  );

  const deactivate = useCallback(() => {
    setIsActive(false);
    setFilterText("");
    setSelectedIndex(0);
  }, []);

  const selectCommand = useCallback((command: string) => {
    setIsActive(false);
    setFilterText("");
    setSelectedIndex(0);
    return command + " ";
  }, []);

  const moveSelection = useCallback(
    (direction: "up" | "down") => {
      setSelectedIndex((prev) => {
        const len = filteredCommands.length;
        if (len === 0) return 0;
        if (direction === "down") return (prev + 1) % len;
        return (prev - 1 + len) % len;
      });
    },
    [filteredCommands.length],
  );

  const autocomplete = useCallback((): string | null => {
    if (!isActive || filteredCommands.length === 0) return null;
    const cmd = filteredCommands[selectedIndex];
    if (!cmd) return null;
    setIsActive(false);
    setFilterText("");
    setSelectedIndex(0);
    return cmd.name + " ";
  }, [isActive, filteredCommands, selectedIndex]);

  return {
    isActive,
    filteredCommands,
    selectedIndex,
    activate,
    deactivate,
    selectCommand,
    moveSelection,
    autocomplete,
  };
}
