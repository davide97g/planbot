import { useState, useRef, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export interface MentionResult {
  type: string;
  id: string;
  display: string;
  summary?: string;
}

export interface UseMentionsReturn {
  query: string;
  results: MentionResult[];
  isSearching: boolean;
  search: (query: string, type: "jira" | "confluence") => void;
  clear: () => void;
}

export function useMentions(): UseMentionsReturn {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentionResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string, type: "jira" | "confluence") => {
    setQuery(q);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!q.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/api/search?type=${encodeURIComponent(type)}&q=${encodeURIComponent(q)}`,
          { method: "GET" }
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const clear = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setQuery("");
    setResults([]);
    setIsSearching(false);
  }, []);

  return { query, results, isSearching, search, clear };
}
