import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface SlackChannel {
  id: string;
  name: string;
}

export interface UseSlackChannelsReturn {
  channels: SlackChannel[];
  isLoading: boolean;
  error: string | null;
  search: (query: string) => SlackChannel[];
}

export function useSlackChannels(): UseSlackChannelsReturn {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchChannels() {
      try {
        const res = await apiFetch("/api/slack/channels", { method: "GET" });
        if (!res.ok) {
          throw new Error(`Failed to fetch channels: ${res.status}`);
        }
        const data = (await res.json()) as { channels: SlackChannel[] };
        if (!cancelled) {
          setChannels(data.channels || []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setChannels([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchChannels();
    return () => {
      cancelled = true;
    };
  }, []);

  const search = useCallback(
    (query: string): SlackChannel[] => {
      if (!query) return channels;
      const lower = query.toLowerCase();
      return channels.filter((ch) => ch.name.toLowerCase().startsWith(lower));
    },
    [channels]
  );

  return { channels, isLoading, error, search };
}
