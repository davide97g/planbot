import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Copy } from "lucide-react";
import { apiFetch } from "@/lib/api";

type MemoryCategory = "fact" | "preference" | "project" | "team" | "plan_outcome";

interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  category: MemoryCategory;
  alwaysInclude: boolean;
  createdAt: string;
  source: "user" | "agent";
}

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  fact: "Fact",
  preference: "Preference",
  project: "Project",
  team: "Team",
  plan_outcome: "Plan outcome",
};

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  fact: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  preference: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  project: "bg-green-500/10 text-green-400 border-green-500/20",
  team: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  plan_outcome: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

const EMPTY_FORM = { title: "", content: "", category: "fact" as MemoryCategory, alwaysInclude: true };

export default function MemoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "always" | "manual">("all");
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | "all">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MemoryEntry>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch("/api/memory")
      .then((r) => r.json() as Promise<{ entries: MemoryEntry[] }>)
      .then((d) => { setEntries(d.entries ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const saveEdit = async (id: string) => {
    const res = await apiFetch(`/api/memory/${id}`, {
      method: "PUT",
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const data = await res.json() as { entry: MemoryEntry };
      setEntries((prev) => prev.map((e) => (e.id === id ? data.entry : e)));
    }
    setEditingId(null);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this memory entry?")) return;
    const res = await apiFetch(`/api/memory/${id}`, { method: "DELETE" });
    if (res.ok) setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const toggleAlways = async (entry: MemoryEntry) => {
    const updated = { ...entry, alwaysInclude: !entry.alwaysInclude };
    const res = await apiFetch(`/api/memory/${entry.id}`, {
      method: "PUT",
      body: JSON.stringify({ alwaysInclude: updated.alwaysInclude }),
    });
    if (res.ok) setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
  };

  const createEntry = async () => {
    if (!createForm.title.trim() || !createForm.content.trim()) return;
    const res = await apiFetch("/api/memory", {
      method: "POST",
      body: JSON.stringify(createForm),
    });
    if (res.ok) {
      const data = await res.json() as { entry: MemoryEntry };
      setEntries((prev) => [data.entry, ...prev]);
      setCreateForm({ ...EMPTY_FORM });
      setShowCreate(false);
    }
  };

  const copyId = (id: string) => {
    const short = id.slice(0, 8);
    navigator.clipboard.writeText(`@memory:${short}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditingId(entry.id);
    setEditForm({ title: entry.title, content: entry.content, category: entry.category, alwaysInclude: entry.alwaysInclude });
    setTimeout(() => editTitleRef.current?.focus(), 50);
  };

  const visible = entries.filter((e) => {
    if (filter === "always" && !e.alwaysInclude) return false;
    if (filter === "manual" && e.alwaysInclude) return false;
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    return true;
  });

  const alwaysCount = entries.filter((e) => e.alwaysInclude).length;
  const manualCount = entries.filter((e) => !e.alwaysInclude).length;

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 pt-16 pb-16">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to chat
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New memory
          </Button>
        </div>

        {/* Title + stats */}
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Memory Banks</h1>
          <p className="text-sm text-muted-foreground">
            Long-term context injected into every conversation. Use{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">@memory:id</code>{" "}
            in chat to pull in a specific memory.
          </p>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex rounded-md border border-border overflow-hidden text-sm">
            {(["all", "always", "manual"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  filter === f
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? `All (${entries.length})` : f === "always" ? `Always (${alwaysCount})` : `Manual (${manualCount})`}
              </button>
            ))}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as MemoryCategory | "all")}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground"
          >
            <option value="all">All categories</option>
            {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">New memory entry</h3>
            <input
              autoFocus
              placeholder="Title (short label)"
              value={createForm.title}
              onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Content (what the AI should know)"
              value={createForm.content}
              onChange={(e) => setCreateForm((p) => ({ ...p, content: e.target.value }))}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={createForm.category}
                onChange={(e) => setCreateForm((p) => ({ ...p, category: e.target.value as MemoryCategory }))}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={createForm.alwaysInclude}
                  onChange={(e) => setCreateForm((p) => ({ ...p, alwaysInclude: e.target.checked }))}
                  className="h-4 w-4"
                />
                Always include
              </label>
              <div className="flex gap-2 ml-auto">
                <Button variant="ghost" size="sm" onClick={() => { setShowCreate(false); setCreateForm({ ...EMPTY_FORM }); }}>
                  Cancel
                </Button>
                <Button size="sm" onClick={createEntry} disabled={!createForm.title.trim() || !createForm.content.trim()}>
                  Create
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Entries list */}
        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            {entries.length === 0 ? "No memory entries yet. Create one or start a conversation — the AI will remember things automatically." : "No entries match this filter."}
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-border bg-card p-4 space-y-2"
              >
                {editingId === entry.id ? (
                  /* Edit mode */
                  <div className="space-y-2">
                    <input
                      ref={editTitleRef}
                      value={editForm.title ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium"
                    />
                    <textarea
                      value={editForm.content ?? ""}
                      onChange={(e) => setEditForm((p) => ({ ...p, content: e.target.value }))}
                      rows={3}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm resize-none"
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <select
                        value={editForm.category ?? "fact"}
                        onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value as MemoryCategory }))}
                        className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                      >
                        {(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
                          <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={editForm.alwaysInclude ?? true}
                          onChange={(e) => setEditForm((p) => ({ ...p, alwaysInclude: e.target.checked }))}
                          className="h-3.5 w-3.5"
                        />
                        Always include
                      </label>
                      <div className="flex gap-2 ml-auto">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" className="h-7 w-7 p-0" onClick={() => saveEdit(entry.id)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-sm truncate">{entry.title}</span>
                        <span className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[entry.category]}`}>
                          {CATEGORY_LABELS[entry.category]}
                        </span>
                        {entry.source === "agent" && (
                          <span className="shrink-0 text-xs text-muted-foreground italic">agent</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          title={copiedId === entry.id ? "Copied!" : "Copy @mention"}
                          onClick={() => copyId(entry.id)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {copiedId === entry.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          title="Edit"
                          onClick={() => startEdit(entry)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          title="Delete"
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{entry.content}</p>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleAlways(entry)}
                          className={`flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 border transition-colors cursor-pointer ${
                            entry.alwaysInclude
                              ? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
                              : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {entry.alwaysInclude ? "● Always included" : "○ Manual only"}
                        </button>
                        <span className="text-xs text-muted-foreground font-mono">
                          @memory:{entry.id.slice(0, 8)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">{entry.createdAt}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
