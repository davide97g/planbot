import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface WorkspaceInfo {
  jiraBoard: { id: number; name: string; url: string } | null;
  confluenceUrl: string | null;
}

export function useWorkspace() {
  const [info, setInfo] = useState<WorkspaceInfo>({ jiraBoard: null, confluenceUrl: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/workspace", { method: "GET" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setInfo({ jiraBoard: data.jiraBoard ?? null, confluenceUrl: data.confluenceUrl ?? null });
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { ...info, isLoading };
}
