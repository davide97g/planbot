import { useState, useRef, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import type { SlackChannel } from "./useSlackChannels";

export interface UnifiedSearchResult {
  id: string;
  display: string;
  sourceType: "jira" | "confluence" | "slack" | "memory" | "sprint";
  subtext?: string;
  issueType?: string; // jira only
}

interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  category: string;
}

interface SprintEntry {
  id: number;
  name: string;
  state: string;
  boardName: string;
}

export function useUnifiedSearch(slackChannels: SlackChannel[]) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [memoryEntries, setMemoryEntries] = useState<MemoryEntry[]>([]);
  const [sprintEntries, setSprintEntries] = useState<SprintEntry[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load memory and sprints once on mount for local filtering
  useEffect(() => {
    async function loadLocal() {
      try {
        const [memRes, sprintRes] = await Promise.all([
          apiFetch("/api/memory", { method: "GET" }),
          apiFetch("/api/sprints", { method: "GET" }),
        ]);
        if (memRes.ok) {
          const data = (await memRes.json()) as { entries: MemoryEntry[] };
          setMemoryEntries(data.entries || []);
        }
        if (sprintRes.ok) {
          const data = (await sprintRes.json()) as { sprints: SprintEntry[] };
          setSprintEntries(data.sprints || []);
        }
      } catch {
        // ignore — sidebar search just won't show memory/sprint results
      }
    }
    loadLocal();
  }, []);

  const search = useCallback(
    (q: string) => {
      setQuery(q);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();

      const trimmed = q.trim();
      if (!trimmed || trimmed.length < 2) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      const lower = trimmed.toLowerCase();

      // Local results available immediately
      const localResults: UnifiedSearchResult[] = [];

      const matchingChannels = slackChannels
        .filter((ch) => ch.name.toLowerCase().includes(lower))
        .slice(0, 3);
      for (const ch of matchingChannels) {
        localResults.push({
          id: ch.id,
          display: ch.name,
          sourceType: "slack",
          subtext: "Slack channel",
        });
      }

      const matchingMemory = memoryEntries
        .filter(
          (m) =>
            m.title.toLowerCase().includes(lower) ||
            m.content.toLowerCase().includes(lower),
        )
        .slice(0, 3);
      for (const m of matchingMemory) {
        localResults.push({
          id: m.id,
          display: m.title,
          sourceType: "memory",
          subtext: `Memory · ${m.category}`,
        });
      }

      const matchingSprints = sprintEntries
        .filter((s) => s.name.toLowerCase().includes(lower))
        .slice(0, 2);
      for (const s of matchingSprints) {
        localResults.push({
          id: String(s.id),
          display: s.name,
          sourceType: "sprint",
          subtext: `Sprint · ${s.state === "active" ? "Active" : s.boardName}`,
        });
      }

      setResults(localResults);
      setIsSearching(true);

      debounceRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const [jiraRes, confluenceRes] = await Promise.all([
            apiFetch(
              `/api/search?type=jira&q=${encodeURIComponent(trimmed)}`,
              { method: "GET", signal: controller.signal },
            ),
            apiFetch(
              `/api/search?type=confluence&q=${encodeURIComponent(trimmed)}`,
              { method: "GET", signal: controller.signal },
            ),
          ]);

          const apiResults: UnifiedSearchResult[] = [];

          if (jiraRes.ok) {
            const data = (await jiraRes.json()) as {
              results: Array<{
                id: string;
                display: string;
                issueType?: string;
                status?: string;
              }>;
            };
            for (const r of (data.results || []).slice(0, 4)) {
              apiResults.push({
                id: r.id,
                display: r.display,
                sourceType: "jira",
                issueType: r.issueType,
                subtext: [r.issueType, r.status].filter(Boolean).join(" · "),
              });
            }
          }

          if (confluenceRes.ok) {
            const data = (await confluenceRes.json()) as {
              results: Array<{
                id: string;
                display: string;
                summary?: string;
              }>;
            };
            for (const r of (data.results || []).slice(0, 3)) {
              apiResults.push({
                id: r.id,
                display: r.display,
                sourceType: "confluence",
                subtext: r.summary
                  ? r.summary.slice(0, 60) + (r.summary.length > 60 ? "…" : "")
                  : "Confluence page",
              });
            }
          }

          if (!controller.signal.aborted) {
            // API results first (richer context), then local
            setResults([...apiResults, ...localResults]);
          }
        } catch {
          // keep local results on error
        } finally {
          if (!controller.signal.aborted) {
            setIsSearching(false);
          }
        }
      }, 300);
    },
    [slackChannels, memoryEntries, sprintEntries],
  );

  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
    setIsSearching(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { query, results, isSearching, search, clear };
}
