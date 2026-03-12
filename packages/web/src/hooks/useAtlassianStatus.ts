import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";

export interface AtlassianStatus {
  connected: boolean;
  loading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useAtlassianStatus(): AtlassianStatus {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/auth/atlassian/status")
      .then((res) => {
        if (res.ok) return res.json() as Promise<{ connected: boolean }>;
        return { connected: false };
      })
      .then((data) => setConnected(data.connected))
      .catch(() => setConnected(false))
      .finally(() => setLoading(false));
  }, []);

  async function connect(): Promise<void> {
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/atlassian/connect");
      if (!res.ok) {
        setError("Failed to connect. Try again.");
        return;
      }
      const { url } = await res.json() as { url: string };
      setError(null);
      window.location.href = url;
    } catch {
      setError("Failed to connect. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect(): Promise<void> {
    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/atlassian/token", { method: "DELETE" });
      if (!res.ok) {
        setError("Failed to disconnect. Try again.");
        return;
      }
      setError(null);
      setConnected(false);
    } catch {
      setError("Failed to disconnect. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return { connected, loading, error, connect, disconnect };
}
