import { useState, useCallback } from "react";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  createdBy: "user" | "ai";
  order: number;
  createdAt: string;
}

const STORAGE_KEY = "planbot_tasks";

function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw) as Task[];
    }
  } catch {
    // ignore corrupt data
  }
  return [];
}

function persistTasks(tasks: Task[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.order - b.order;
  });
}

export function useTaskStore() {
  const [tasks, setTasks] = useState<Task[]>(() => sortTasks(loadTasks()));

  const updateTasks = useCallback((updater: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = sortTasks(updater(prev));
      persistTasks(next);
      return next;
    });
  }, []);

  const addTask = useCallback(
    (title: string, createdBy: "user" | "ai" = "user"): Task => {
      const task: Task = {
        id: crypto.randomUUID(),
        title,
        done: false,
        createdBy,
        order: Date.now(),
        createdAt: new Date().toISOString(),
      };
      updateTasks((prev) => [...prev, task]);
      return task;
    },
    [updateTasks],
  );

  const toggleTask = useCallback(
    (id: string): void => {
      updateTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
    },
    [updateTasks],
  );

  const deleteTask = useCallback(
    (id: string): void => {
      updateTasks((prev) => prev.filter((t) => t.id !== id));
    },
    [updateTasks],
  );

  const reorderTasks = useCallback(
    (fromIndex: number, toIndex: number): void => {
      updateTasks((prev) => {
        const items = [...prev];
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        return items.map((t, i) => ({ ...t, order: i }));
      });
    },
    [updateTasks],
  );

  const clearCompleted = useCallback((): void => {
    updateTasks((prev) => prev.filter((t) => !t.done));
  }, [updateTasks]);

  const getTaskById = useCallback(
    (id: string): Task | undefined => {
      return tasks.find((t) => t.id === id);
    },
    [tasks],
  );

  return {
    tasks,
    addTask,
    toggleTask,
    deleteTask,
    reorderTasks,
    clearCompleted,
    getTaskById,
  };
}
