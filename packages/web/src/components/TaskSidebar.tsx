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
} from "lucide-react";

interface TaskSidebarProps {
  tasks: Task[];
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onClearCompleted: () => void;
}

export function TaskSidebar({
  tasks,
  onAdd,
  onToggle,
  onDelete,
  onReorder,
  onClearCompleted,
}: TaskSidebarProps) {
  const [newTitle, setNewTitle] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const completedCount = tasks.filter((t) => t.done).length;

  const handleAdd = useCallback(() => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setNewTitle("");
    inputRef.current?.focus();
  }, [newTitle, onAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropIndex(index);
    },
    [],
  );

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

  return (
    <div className="flex h-full w-[300px] flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {tasks.length}
          </Badge>
        </div>
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
      </div>

      {/* Add task input */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
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
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No tasks yet
          </p>
        )}
        {tasks.map((task, index) => (
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
            {/* Drag handle */}
            <div className="cursor-grab opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing">
              <GripVerticalIcon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>

            {/* Checkbox */}
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

            {/* Title + AI badge */}
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span
                className={`truncate text-sm ${
                  task.done
                    ? "text-muted-foreground line-through"
                    : "text-foreground"
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

            {/* Delete button */}
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
      </div>
    </div>
  );
}
