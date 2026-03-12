import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface SprintSuggestion {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  boardId: number;
  boardName: string;
}

export function useSprintSuggestions() {
  const [sprints, setSprints] = useState<SprintSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (loaded || isLoading) return;
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/sprints", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        setSprints(data.sprints || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
      setLoaded(true);
    }
  }, [loaded, isLoading]);

  const filter = useCallback(
    (query: string): SprintSuggestion[] => {
      if (!query) return sprints;
      const q = query.toLowerCase();
      return sprints.filter((s) => s.name.toLowerCase().includes(q));
    },
    [sprints],
  );

  return { sprints, isLoading, load, filter };
}
