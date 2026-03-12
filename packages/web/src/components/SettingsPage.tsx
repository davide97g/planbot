import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeftIcon } from "lucide-react";
import { apiFetch } from "@/lib/api";

const MODEL_OPTIONS: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
  anthropic: ["claude-sonnet-4-5-20250514", "claude-haiku-4-5-20251001"],
};

const STORAGE_KEY = "planbot_model";

export default function SettingsPage() {
  const navigate = useNavigate();
  const [provider, setProvider] = useState<string | null>(null);
  const [, setBackendModel] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  useEffect(() => {
    apiFetch("/api/settings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch settings");
        return res.json() as Promise<{ provider: string; model: string }>;
      })
      .then((data) => {
        setProvider(data.provider);
        setBackendModel(data.model);

        const stored = localStorage.getItem(STORAGE_KEY);
        const options = MODEL_OPTIONS[data.provider] ?? [];
        if (stored && options.includes(stored)) {
          setSelectedModel(stored);
        } else {
          setSelectedModel(data.model);
        }
      })
      .catch(() => {
        setProvider("Unknown");
      });
  }, []);

  const options = provider && provider !== "Unknown" ? (MODEL_OPTIONS[provider] ?? []) : [];

  function handleModelChange(value: string) {
    setSelectedModel(value);
    localStorage.setItem(STORAGE_KEY, value);
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 pt-16">
      <div className="w-full max-w-lg space-y-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to chat
        </Button>

        <div className="rounded-lg border border-border bg-card p-6 space-y-6">
          <h1 className="text-lg font-semibold">Settings</h1>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Provider</label>
            <div>
              <Badge variant="secondary">{provider ?? "Loading..."}</Badge>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="model-select" className="text-sm font-medium">
              Model
            </label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(e) => handleModelChange(e.target.value)}
              disabled={options.length === 0}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {options.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            Settings saved automatically
          </p>
        </div>
      </div>
    </div>
  );
}
