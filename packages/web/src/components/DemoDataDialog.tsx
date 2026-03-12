import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import {
  DatabaseIcon,
  LoaderIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertCircleIcon,
} from "lucide-react";

interface LogEntry {
  id: number;
  type: "progress" | "issue_created" | "page_created" | "issue_error" | "page_error" | "done" | "error";
  message: string;
  status: "ok" | "error" | "info";
}

interface DemoDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DemoDataDialog({ open, onOpenChange }: DemoDataDialogProps) {
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState("");
  const [step, setStep] = useState(0);
  const [total, setTotal] = useState(65);
  const [jiraEnabled, setJiraEnabled] = useState(true);
  const [confluenceEnabled, setConfluenceEnabled] = useState(true);
  const [result, setResult] = useState<{
    jiraIssuesCreated: number;
    confluencePagesCreated: number;
  } | null>(null);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  function addLog(type: LogEntry["type"], message: string, status: LogEntry["status"] = "info") {
    const entry: LogEntry = { id: ++idRef.current, type, message, status };
    setLogs((prev) => [...prev, entry]);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }

  async function generate() {
    if (!jiraEnabled && !confluenceEnabled) return;

    setRunning(true);
    setLogs([]);
    setResult(null);
    setProgress("Starting...");
    setStep(0);

    try {
      const res = await apiFetch("/api/demo/generate", {
        method: "POST",
        body: JSON.stringify({ jira: jiraEnabled, confluence: confluenceEnabled }),
      });

      if (!res.ok) {
        const text = await res.text();
        addLog("error", `Request failed: ${res.status} ${text}`, "error");
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        addLog("error", "No response stream", "error");
        setRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const dataLine = line.trim();
          if (!dataLine.startsWith("data: ")) continue;
          const json = dataLine.slice(6);
          try {
            const event = JSON.parse(json);
            const { type, data } = event;

            switch (type) {
              case "progress":
                setProgress(data.message);
                setStep(data.step);
                setTotal(data.total);
                break;
              case "issue_created":
                addLog("issue_created", `${data.key}: ${data.summary}`, "ok");
                break;
              case "page_created":
                addLog("page_created", `Page: ${data.title}`, "ok");
                break;
              case "issue_error":
                addLog("issue_error", `Failed: ${data.summary} - ${data.error}`, "error");
                break;
              case "page_error":
                addLog("page_error", `Failed: ${data.title} - ${data.error}`, "error");
                break;
              case "done":
                setResult({
                  jiraIssuesCreated: data.jiraIssuesCreated ?? 0,
                  confluencePagesCreated: data.confluencePagesCreated ?? 0,
                });
                setProgress("Complete!");
                {
                  const parts: string[] = [];
                  if (data.jiraIssuesCreated) parts.push(`${data.jiraIssuesCreated} Jira issues`);
                  if (data.confluencePagesCreated) parts.push(`${data.confluencePagesCreated} Confluence pages`);
                  addLog("done", `Done! Created ${parts.join(" and ")}.`, "ok");
                }
                break;
              case "error":
                addLog("error", data.message, "error");
                break;
            }
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      addLog("error", err instanceof Error ? err.message : String(err), "error");
    } finally {
      setRunning(false);
    }
  }

  function handleClose(open: boolean) {
    if (!running) {
      onOpenChange(open);
      if (!open) {
        setLogs([]);
        setResult(null);
        setProgress("");
        setStep(0);
      }
    }
  }

  const nothingSelected = !jiraEnabled && !confluenceEnabled;
  const pct = total > 0 ? Math.round((step / total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DatabaseIcon className="size-5" />
            Generate Demo Data
          </DialogTitle>
          <DialogDescription>
            Seed your connected Atlassian instance with realistic project data.
          </DialogDescription>
        </DialogHeader>

        {/* Checkboxes — only show before running */}
        {!running && !result && (
          <div className="flex flex-col gap-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={jiraEnabled}
                onChange={(e) => setJiraEnabled(e.target.checked)}
                className="size-4 rounded border-border accent-primary"
              />
              <span>Jira issues</span>
              <span className="text-muted-foreground text-xs">(50 issues in KAN project)</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={confluenceEnabled}
                onChange={(e) => setConfluenceEnabled(e.target.checked)}
                className="size-4 rounded border-border accent-primary"
              />
              <span>Confluence pages</span>
              <span className="text-muted-foreground text-xs">(15 pages with rich content)</span>
            </label>
          </div>
        )}

        {(running || logs.length > 0) && (
          <div className="space-y-3">
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress}</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Log output */}
            <div
              ref={scrollRef}
              className="h-52 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs font-mono space-y-0.5"
            >
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-1.5">
                  {log.status === "ok" && (
                    <CheckCircleIcon className="size-3 text-emerald-500 mt-0.5 shrink-0" />
                  )}
                  {log.status === "error" && (
                    <XCircleIcon className="size-3 text-destructive mt-0.5 shrink-0" />
                  )}
                  {log.status === "info" && (
                    <AlertCircleIcon className="size-3 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <span className={log.status === "error" ? "text-destructive" : ""}>
                    {log.message}
                  </span>
                </div>
              ))}
              {running && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <LoaderIcon className="size-3 animate-spin" />
                  <span>Working...</span>
                </div>
              )}
            </div>

            {/* Summary */}
            {result && (
              <div className="flex gap-2">
                {(result.jiraIssuesCreated ?? 0) > 0 && (
                  <Badge variant="outline" className="text-emerald-600 border-emerald-200">
                    {result.jiraIssuesCreated} Jira issues
                  </Badge>
                )}
                {(result.confluencePagesCreated ?? 0) > 0 && (
                  <Badge variant="outline" className="text-sky-600 border-sky-200">
                    {result.confluencePagesCreated} Confluence pages
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!running && !result && (
            <Button onClick={generate} disabled={nothingSelected} className="gap-1.5">
              <DatabaseIcon className="size-4" />
              Generate Demo Data
            </Button>
          )}
          {!running && result && (
            <Button variant="outline" onClick={() => handleClose(false)}>
              Close
            </Button>
          )}
          {running && (
            <Button disabled className="gap-1.5">
              <LoaderIcon className="size-4 animate-spin" />
              Generating...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
