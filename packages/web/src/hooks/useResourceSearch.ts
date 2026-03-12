import { useState, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface ResourceResult {
  id: string;
  display: string;
  summary?: string;
  status?: string;
  issueType?: string;
  url?: string;
}

export interface UseResourceSearchReturn {
  /** Whether the search popover should be shown */
  isActive: boolean;
  /** "jira" or "confluence" */
  resourceType: "jira" | "confluence" | null;
  /** Current search query text (after the command prefix) */
  query: string;
  results: ResourceResult[];
  isSearching: boolean;
  /** Whether the current query is a URL (for different UI treatment) */
  isUrlQuery: boolean;
  /** Call when input value changes — detects `/jira <query>` or `/confluence <query>` */
  update: (text: string) => void;
  /** Select a result — returns the text to insert into the input */
  select: (result: ResourceResult) => string;
  /** Dismiss the popover */
  dismiss: () => void;
}

const SEARCH_COMMANDS: Record<string, "jira" | "confluence"> = {
  "/jira": "jira",
  "/confluence": "confluence",
};

function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

export function useResourceSearch(): UseResourceSearchReturn {
  const [isActive, setIsActive] = useState(false);
  const [resourceType, setResourceType] = useState<"jira" | "confluence" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResourceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isUrlQuery, setIsUrlQuery] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = useCallback((q: string, type: "jira" | "confluence") => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const queryIsUrl = isUrl(q);
    setIsUrlQuery(queryIsUrl);

    if (q.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    // Shorter debounce for URLs (fetch immediately), normal debounce for text search
    const delay = queryIsUrl ? 100 : 300;

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await apiFetch(
          `/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q.trim())}`,
          { method: "GET", signal: controller.signal },
        );
        if (res.ok) {
          const data = await res.json();
          if (!controller.signal.aborted) {
            setResults(data.results || []);
          }
        } else {
          if (!controller.signal.aborted) setResults([]);
        }
      } catch {
        if (!abortRef.current?.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, delay);
  }, []);

  const update = useCallback(
    (text: string) => {
      // Check if text starts with a search command followed by a space
      for (const [prefix, type] of Object.entries(SEARCH_COMMANDS)) {
        if (text.toLowerCase().startsWith(prefix + " ")) {
          const q = text.slice(prefix.length + 1);
          setIsActive(true);
          setResourceType(type);
          setQuery(q);
          doSearch(q, type);
          return;
        }
      }

      // Not a search command — deactivate
      if (isActive) {
        setIsActive(false);
        setResourceType(null);
        setQuery("");
        setResults([]);
        setIsSearching(false);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (abortRef.current) abortRef.current.abort();
      }
    },
    [isActive, doSearch],
  );

  const select = useCallback(
    (result: ResourceResult): string => {
      setIsActive(false);
      setResults([]);
      setQuery("");
      if (debounceRef.current) clearTimeout(debounceRef.current);

      // Build the command text with the selected resource
      if (resourceType === "jira") {
        return `/jira ${result.id}`;
      }
      return `/confluence ${result.display}`;
    },
    [resourceType],
  );

  const dismiss = useCallback(() => {
    setIsActive(false);
    setResults([]);
    setQuery("");
    setIsSearching(false);
    setIsUrlQuery(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return {
    isActive,
    resourceType,
    query,
    results,
    isSearching,
    isUrlQuery,
    update,
    select,
    dismiss,
  };
}
