import {
	AlertCircleIcon,
	ArrowLeftIcon,
	BellIcon,
	BrainIcon,
	CheckIcon,
	CopyIcon,
	CpuIcon,
	Loader2Icon,
	PaletteIcon,
	PencilIcon,
	PlusIcon,
	Trash2Icon,
	XIcon,
	ZapIcon,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODEL_OPTIONS: Record<string, string[]> = {
	openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini"],
	anthropic: ["claude-sonnet-4-5-20250514", "claude-haiku-4-5-20251001"],
};
const STORAGE_KEY = "planbot_model";
const NOTIF_STORAGE_KEY = "planbot_notifications";
const TIMEZONE_OPTIONS = [
	"America/New_York",
	"America/Chicago",
	"America/Denver",
	"America/Los_Angeles",
	"Europe/London",
	"Europe/Paris",
	"Europe/Rome",
	"Europe/Berlin",
	"Asia/Tokyo",
	"Asia/Shanghai",
	"Australia/Sydney",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "ai" | "notifications" | "memory" | "theme";

interface NotificationPrefs {
	enabled: boolean;
	slackUserId: string;
	dailyDigest: { enabled: boolean; time: string; timezone: string };
	sprintAlerts: { enabled: boolean };
	riskAlerts: { enabled: boolean; threshold: "high" | "medium" | "low" };
}
const DEFAULT_PREFS: NotificationPrefs = {
	enabled: false,
	slackUserId: "",
	dailyDigest: { enabled: true, time: "09:00", timezone: "Europe/Rome" },
	sprintAlerts: { enabled: true },
	riskAlerts: { enabled: true, threshold: "high" },
};

type MemoryCategory =
	| "fact"
	| "preference"
	| "project"
	| "team"
	| "plan_outcome";
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
const EMPTY_FORM = {
	title: "",
	content: "",
	category: "fact" as MemoryCategory,
	alwaysInclude: true,
};

// ─── Shared atoms ─────────────────────────────────────────────────────────────

function Toggle({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			onClick={() => onChange(!checked)}
			className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
				checked ? "bg-primary" : "bg-muted"
			}`}
		>
			<span
				className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg transition-transform duration-200 ${
					checked ? "translate-x-4" : "translate-x-0"
				}`}
			/>
		</button>
	);
}

function FieldLabel({ children }: { children: ReactNode }) {
	return (
		<p className="text-sm font-medium text-foreground">{children}</p>
	);
}

function StyledSelect({
	value,
	onChange,
	disabled,
	children,
}: {
	value: string;
	onChange: (v: string) => void;
	disabled?: boolean;
	children: ReactNode;
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
			className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40"
		>
			{children}
		</select>
	);
}

function StyledInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	return (
		<input
			type="text"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
		/>
	);
}

function StyledTextarea({
	value,
	onChange,
	placeholder,
	rows = 3,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	rows?: number;
}) {
	return (
		<textarea
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			rows={rows}
			className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
		/>
	);
}

function SubSection({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-md border border-border p-4 space-y-3">
			{children}
		</div>
	);
}

function ToggleRow({
	label,
	hint,
	checked,
	onChange,
}: {
	label: string;
	hint?: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="space-y-0.5">
				<p className="text-sm font-medium">{label}</p>
				{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			</div>
			<Toggle checked={checked} onChange={onChange} />
		</div>
	);
}

// ─── Tab: AI ──────────────────────────────────────────────────────────────────

function AITab() {
	const [provider, setProvider] = useState<string | null>(null);
	const [selectedModel, setSelectedModel] = useState<string>("");

	useEffect(() => {
		apiFetch("/api/settings")
			.then((res) => {
				if (!res.ok) throw new Error();
				return res.json() as Promise<{ provider: string; model: string }>;
			})
			.then((data) => {
				setProvider(data.provider);
				const stored = localStorage.getItem(STORAGE_KEY);
				const opts = MODEL_OPTIONS[data.provider] ?? [];
				setSelectedModel(stored && opts.includes(stored) ? stored : data.model);
			})
			.catch(() => setProvider("unknown"));
	}, []);

	const options =
		provider && provider !== "unknown" ? (MODEL_OPTIONS[provider] ?? []) : [];

	return (
		<div className="space-y-6">
			<div className="space-y-1.5">
				<FieldLabel>Provider</FieldLabel>
				<div>
					{provider ? (
						<Badge variant="secondary">{provider}</Badge>
					) : (
						<span className="text-sm text-muted-foreground">Connecting…</span>
					)}
				</div>
			</div>

			<div className="space-y-1.5">
				<FieldLabel>Model</FieldLabel>
				<StyledSelect
					value={selectedModel}
					onChange={(v) => {
						setSelectedModel(v);
						localStorage.setItem(STORAGE_KEY, v);
					}}
					disabled={options.length === 0}
				>
					{options.map((m) => (
						<option key={m} value={m}>
							{m}
						</option>
					))}
				</StyledSelect>
			</div>

			<p className="text-xs text-muted-foreground">
				Settings saved automatically
			</p>
		</div>
	);
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────

function NotificationsTab() {
	const [notifPrefs, setNotifPrefs] =
		useState<NotificationPrefs>(DEFAULT_PREFS);
	const [notifSaved, setNotifSaved] = useState(false);
	const [testStatus, setTestStatus] = useState<
		"idle" | "sending" | "ok" | "error"
	>("idle");
	const [testError, setTestError] = useState("");

	useEffect(() => {
		const local = localStorage.getItem(NOTIF_STORAGE_KEY);
		if (local) {
			try {
				setNotifPrefs(JSON.parse(local));
			} catch {
				/* ignore */
			}
		}
		apiFetch("/api/settings/notifications", { method: "GET" })
			.then(
				(r) => r.json() as Promise<{ preferences: NotificationPrefs | null }>,
			)
			.then((d) => {
				if (d.preferences) {
					setNotifPrefs(d.preferences);
					localStorage.setItem(
						NOTIF_STORAGE_KEY,
						JSON.stringify(d.preferences),
					);
				}
			})
			.catch(() => {});
	}, []);

	const saveNotifPrefs = useCallback(async (prefs: NotificationPrefs) => {
		setNotifPrefs(prefs);
		setNotifSaved(false);
		localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(prefs));
		try {
			await apiFetch("/api/settings/notifications", {
				method: "PUT",
				body: JSON.stringify(prefs),
			});
			setNotifSaved(true);
			setTimeout(() => setNotifSaved(false), 2000);
		} catch {
			/* saved to localStorage */
		}
	}, []);

	const sendTestNotification = async () => {
		setTestStatus("sending");
		setTestError("");
		try {
			const res = await apiFetch("/api/settings/notifications/test", {
				method: "POST",
				body: JSON.stringify({ slackUserId: notifPrefs.slackUserId }),
			});
			const data = (await res.json()) as { ok?: boolean; error?: string };
			if (data.ok) {
				setTestStatus("ok");
			} else {
				setTestStatus("error");
				setTestError(data.error ?? "Unknown error");
			}
		} catch (err) {
			setTestStatus("error");
			setTestError(err instanceof Error ? err.message : "Request failed");
		}
		setTimeout(() => setTestStatus("idle"), 4000);
	};

	const updateNotif = (patch: Partial<NotificationPrefs>) =>
		saveNotifPrefs({ ...notifPrefs, ...patch });

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm font-medium">Enable notifications</p>
					<p className="text-xs text-muted-foreground">
						Receive alerts via Slack
					</p>
				</div>
				<div className="flex items-center gap-2">
					{notifSaved && (
						<span className="text-xs text-green-500 flex items-center gap-1">
							<CheckIcon className="h-3 w-3" /> Saved
						</span>
					)}
					<Toggle
						checked={notifPrefs.enabled}
						onChange={(v) => updateNotif({ enabled: v })}
					/>
				</div>
			</div>

			{!notifPrefs.enabled ? (
				<div className="flex items-center gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5">
					<ZapIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
					<p className="text-xs text-muted-foreground">
						Enable to receive Slack alerts, daily digests, and sprint
						notifications
					</p>
				</div>
			) : (
				<>
					{/* Slack User ID */}
					<div className="space-y-1.5">
						<FieldLabel>Slack User ID</FieldLabel>
						<div className="flex gap-2">
							<StyledInput
								value={notifPrefs.slackUserId}
								onChange={(v) => updateNotif({ slackUserId: v })}
								placeholder="U12345678"
							/>
							<Button
								size="sm"
								variant="outline"
								disabled={!notifPrefs.slackUserId || testStatus === "sending"}
								onClick={sendTestNotification}
								className="shrink-0 gap-1.5"
							>
								{testStatus === "sending" && (
									<Loader2Icon className="h-3 w-3 animate-spin" />
								)}
								{testStatus === "ok" && (
									<CheckIcon className="h-3 w-3 text-green-500" />
								)}
								{testStatus === "error" && (
									<AlertCircleIcon className="h-3 w-3 text-destructive" />
								)}
								{testStatus === "idle" && "Test"}
								{testStatus === "sending" && "Sending…"}
								{testStatus === "ok" && "Sent"}
								{testStatus === "error" && "Failed"}
							</Button>
						</div>
						{testStatus === "error" && testError && (
							<p className="text-xs text-destructive">{testError}</p>
						)}
						<p className="text-xs text-muted-foreground">
							Find your Slack user ID in your profile settings
						</p>
					</div>

					<div className="border-t border-border" />

					{/* Daily Digest */}
					<SubSection>
						<ToggleRow
							label="Daily Digest"
							hint="Morning summary of your sprint activity"
							checked={notifPrefs.dailyDigest.enabled}
							onChange={(v) =>
								updateNotif({
									dailyDigest: { ...notifPrefs.dailyDigest, enabled: v },
								})
							}
						/>
						{notifPrefs.dailyDigest.enabled && (
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<p className="text-xs text-muted-foreground">Time</p>
									<input
										type="time"
										value={notifPrefs.dailyDigest.time}
										onChange={(e) =>
											updateNotif({
												dailyDigest: {
													...notifPrefs.dailyDigest,
													time: e.target.value,
												},
											})
										}
										className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
									/>
								</div>
								<div className="space-y-1.5">
									<p className="text-xs text-muted-foreground">Timezone</p>
									<StyledSelect
										value={notifPrefs.dailyDigest.timezone}
										onChange={(v) =>
											updateNotif({
												dailyDigest: {
													...notifPrefs.dailyDigest,
													timezone: v,
												},
											})
										}
									>
										{TIMEZONE_OPTIONS.map((tz) => (
											<option key={tz} value={tz}>
												{tz.replace(/_/g, " ")}
											</option>
										))}
									</StyledSelect>
								</div>
							</div>
						)}
					</SubSection>

					{/* Sprint Alerts */}
					<SubSection>
						<ToggleRow
							label="Sprint boundary alerts"
							hint="Notifications when sprints start or end"
							checked={notifPrefs.sprintAlerts.enabled}
							onChange={(v) => updateNotif({ sprintAlerts: { enabled: v } })}
						/>
					</SubSection>

					{/* Risk Alerts */}
					<SubSection>
						<ToggleRow
							label="Risk alerts"
							hint="Get notified when blockers or risks are detected"
							checked={notifPrefs.riskAlerts.enabled}
							onChange={(v) =>
								updateNotif({
									riskAlerts: { ...notifPrefs.riskAlerts, enabled: v },
								})
							}
						/>
						{notifPrefs.riskAlerts.enabled && (
							<div className="space-y-1.5">
								<p className="text-xs text-muted-foreground">Alert threshold</p>
								<StyledSelect
									value={notifPrefs.riskAlerts.threshold}
									onChange={(v) =>
										updateNotif({
											riskAlerts: {
												...notifPrefs.riskAlerts,
												threshold: v as "high" | "medium" | "low",
											},
										})
									}
								>
									<option value="high">High only</option>
									<option value="medium">Medium and above</option>
									<option value="low">All risks</option>
								</StyledSelect>
							</div>
						)}
					</SubSection>
				</>
			)}
		</div>
	);
}

// ─── Tab: Memory ──────────────────────────────────────────────────────────────

function MemoryTab() {
	const [entries, setEntries] = useState<MemoryEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [filter, setFilter] = useState<"all" | "always" | "manual">("all");
	const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | "all">(
		"all",
	);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<Partial<MemoryEntry>>({});
	const [showCreate, setShowCreate] = useState(false);
	const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const editTitleRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		apiFetch("/api/memory")
			.then((r) => r.json() as Promise<{ entries: MemoryEntry[] }>)
			.then((d) => {
				setEntries(d.entries ?? []);
				setLoading(false);
			})
			.catch(() => setLoading(false));
	}, []);

	const saveEdit = async (id: string) => {
		const res = await apiFetch(`/api/memory/${id}`, {
			method: "PUT",
			body: JSON.stringify(editForm),
		});
		if (res.ok) {
			const d = (await res.json()) as { entry: MemoryEntry };
			setEntries((p) => p.map((e) => (e.id === id ? d.entry : e)));
		}
		setEditingId(null);
	};
	const deleteEntry = async (id: string) => {
		if (!confirm("Delete this memory entry?")) return;
		const res = await apiFetch(`/api/memory/${id}`, { method: "DELETE" });
		if (res.ok) setEntries((p) => p.filter((e) => e.id !== id));
	};
	const toggleAlways = async (entry: MemoryEntry) => {
		const updated = { ...entry, alwaysInclude: !entry.alwaysInclude };
		const res = await apiFetch(`/api/memory/${entry.id}`, {
			method: "PUT",
			body: JSON.stringify({ alwaysInclude: updated.alwaysInclude }),
		});
		if (res.ok)
			setEntries((p) => p.map((e) => (e.id === entry.id ? updated : e)));
	};
	const createEntry = async () => {
		if (!createForm.title.trim() || !createForm.content.trim()) return;
		const res = await apiFetch("/api/memory", {
			method: "POST",
			body: JSON.stringify(createForm),
		});
		if (res.ok) {
			const d = (await res.json()) as { entry: MemoryEntry };
			setEntries((p) => [d.entry, ...p]);
			setCreateForm({ ...EMPTY_FORM });
			setShowCreate(false);
		}
	};
	const copyId = (id: string) => {
		navigator.clipboard.writeText(`@memory:${id.slice(0, 8)}`);
		setCopiedId(id);
		setTimeout(() => setCopiedId(null), 1500);
	};
	const startEdit = (entry: MemoryEntry) => {
		setEditingId(entry.id);
		setEditForm({
			title: entry.title,
			content: entry.content,
			category: entry.category,
			alwaysInclude: entry.alwaysInclude,
		});
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
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex items-center gap-2 flex-wrap">
				<div className="flex rounded-md border border-border overflow-hidden text-sm">
					{(["all", "always", "manual"] as const).map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setFilter(f)}
							className={`px-3 py-1.5 capitalize transition-colors ${
								filter === f
									? "bg-muted font-medium text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							{f === "all"
								? `All (${entries.length})`
								: f === "always"
									? `Always (${alwaysCount})`
									: `Manual (${manualCount})`}
						</button>
					))}
				</div>
				<select
					value={categoryFilter}
					onChange={(e) =>
						setCategoryFilter(e.target.value as MemoryCategory | "all")
					}
					className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				>
					<option value="all">All categories</option>
					{(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
						<option key={cat} value={cat}>
							{CATEGORY_LABELS[cat]}
						</option>
					))}
				</select>
				<Button
					size="sm"
					variant="outline"
					className="ml-auto gap-1.5"
					onClick={() => setShowCreate(true)}
				>
					<PlusIcon className="h-3.5 w-3.5" />
					New memory
				</Button>
			</div>

			{/* Create form */}
			{showCreate && (
				<div className="rounded-lg border border-border bg-card p-4 space-y-3">
					<h3 className="text-sm font-medium">New memory entry</h3>
					<input
						placeholder="Title (short label)"
						value={createForm.title}
						onChange={(e) =>
							setCreateForm((p) => ({ ...p, title: e.target.value }))
						}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					<StyledTextarea
						placeholder="Content (what the AI should know)"
						value={createForm.content}
						onChange={(v) => setCreateForm((p) => ({ ...p, content: v }))}
					/>
					<div className="flex items-center gap-3 flex-wrap">
						<StyledSelect
							value={createForm.category}
							onChange={(v) =>
								setCreateForm((p) => ({
									...p,
									category: v as MemoryCategory,
								}))
							}
						>
							{(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map((cat) => (
								<option key={cat} value={cat}>
									{CATEGORY_LABELS[cat]}
								</option>
							))}
						</StyledSelect>
						<label className="flex items-center gap-2 text-sm cursor-pointer select-none">
							<input
								type="checkbox"
								checked={createForm.alwaysInclude}
								onChange={(e) =>
									setCreateForm((p) => ({
										...p,
										alwaysInclude: e.target.checked,
									}))
								}
								className="h-4 w-4"
							/>
							Always include
						</label>
						<div className="flex gap-2 ml-auto">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setShowCreate(false);
									setCreateForm({ ...EMPTY_FORM });
								}}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								onClick={createEntry}
								disabled={
									!createForm.title.trim() || !createForm.content.trim()
								}
							>
								Create
							</Button>
						</div>
					</div>
				</div>
			)}

			{/* Entries */}
			{loading ? (
				<p className="text-sm text-muted-foreground py-8 text-center">
					Loading…
				</p>
			) : visible.length === 0 ? (
				<p className="text-sm text-muted-foreground py-12 text-center">
					{entries.length === 0
						? "No memory entries yet. Create one or start a conversation — the AI will remember things automatically."
						: "No entries match this filter."}
				</p>
			) : (
				<div className="space-y-2">
					{visible.map((entry) => (
						<div
							key={entry.id}
							className="rounded-lg border border-border bg-card p-4 space-y-2"
						>
							{editingId === entry.id ? (
								<div className="space-y-2">
									<input
										ref={editTitleRef}
										value={editForm.title ?? ""}
										onChange={(e) =>
											setEditForm((p) => ({ ...p, title: e.target.value }))
										}
										className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
									/>
									<textarea
										value={editForm.content ?? ""}
										onChange={(e) =>
											setEditForm((p) => ({
												...p,
												content: e.target.value,
											}))
										}
										rows={3}
										className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
									/>
									<div className="flex items-center gap-3 flex-wrap">
										<select
											value={editForm.category ?? "fact"}
											onChange={(e) =>
												setEditForm((p) => ({
													...p,
													category: e.target.value as MemoryCategory,
												}))
											}
											className="rounded-md border border-border bg-background px-2 py-1.5 text-xs focus:outline-none"
										>
											{(Object.keys(CATEGORY_LABELS) as MemoryCategory[]).map(
												(cat) => (
													<option key={cat} value={cat}>
														{CATEGORY_LABELS[cat]}
													</option>
												),
											)}
										</select>
										<label className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-muted-foreground">
											<input
												type="checkbox"
												checked={editForm.alwaysInclude ?? true}
												onChange={(e) =>
													setEditForm((p) => ({
														...p,
														alwaysInclude: e.target.checked,
													}))
												}
												className="h-3.5 w-3.5"
											/>
											Always include
										</label>
										<div className="flex gap-2 ml-auto">
											<Button
												variant="ghost"
												size="sm"
												className="h-7 w-7 p-0"
												onClick={() => setEditingId(null)}
											>
												<XIcon className="h-3.5 w-3.5" />
											</Button>
											<Button
												size="sm"
												className="h-7 w-7 p-0"
												onClick={() => saveEdit(entry.id)}
											>
												<CheckIcon className="h-3.5 w-3.5" />
											</Button>
										</div>
									</div>
								</div>
							) : (
								<>
									<div className="flex items-start justify-between gap-2">
										<div className="flex items-center gap-2 min-w-0">
											<span className="font-medium text-sm truncate">
												{entry.title}
											</span>
											<span
												className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[entry.category]}`}
											>
												{CATEGORY_LABELS[entry.category]}
											</span>
											{entry.source === "agent" && (
												<span className="shrink-0 text-xs text-muted-foreground italic">
													agent
												</span>
											)}
										</div>
										<div className="flex items-center gap-1 shrink-0">
											<button
												type="button"
												title={
													copiedId === entry.id ? "Copied!" : "Copy @mention"
												}
												onClick={() => copyId(entry.id)}
												className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
											>
												{copiedId === entry.id ? (
													<CheckIcon className="h-3.5 w-3.5 text-green-500" />
												) : (
													<CopyIcon className="h-3.5 w-3.5" />
												)}
											</button>
											<button
												type="button"
												title="Edit"
												onClick={() => startEdit(entry)}
												className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
											>
												<PencilIcon className="h-3.5 w-3.5" />
											</button>
											<button
												type="button"
												title="Delete"
												onClick={() => deleteEntry(entry.id)}
												className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
											>
												<Trash2Icon className="h-3.5 w-3.5" />
											</button>
										</div>
									</div>
									<p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
										{entry.content}
									</p>
									<div className="flex items-center justify-between pt-1">
										<div className="flex items-center gap-2">
											<button
												type="button"
												onClick={() => toggleAlways(entry)}
												className={`flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 border transition-colors cursor-pointer ${
													entry.alwaysInclude
														? "border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20"
														: "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
												}`}
											>
												{entry.alwaysInclude
													? "● Always included"
													: "○ Manual only"}
											</button>
											<span className="text-xs text-muted-foreground font-mono">
												@memory:{entry.id.slice(0, 8)}
											</span>
										</div>
										<span className="text-xs text-muted-foreground">
											{entry.createdAt}
										</span>
									</div>
								</>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

// ─── Tab: Theme ───────────────────────────────────────────────────────────────

function ThemeTab() {
	return (
		<div className="flex flex-col items-center justify-center py-12 gap-3">
			<PaletteIcon className="h-8 w-8 text-muted-foreground/40" />
			<p className="text-sm font-medium text-muted-foreground">
				Theme customization
			</p>
			<p className="text-xs text-muted-foreground/60">
				Coming soon — accent colors, font size, density
			</p>
		</div>
	);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
	{ id: "ai", label: "AI", icon: <CpuIcon className="h-3.5 w-3.5" /> },
	{
		id: "notifications",
		label: "Notifications",
		icon: <BellIcon className="h-3.5 w-3.5" />,
	},
	{
		id: "memory",
		label: "Memory",
		icon: <BrainIcon className="h-3.5 w-3.5" />,
	},
	{
		id: "theme",
		label: "Theme",
		icon: <PaletteIcon className="h-3.5 w-3.5" />,
	},
];

export default function SettingsPage() {
	const navigate = useNavigate();
	const [activeTab, setActiveTab] = useState<Tab>("ai");

	return (
		<div className="flex min-h-screen items-start justify-center bg-background px-4 pt-12 pb-16">
			<div className="w-full max-w-2xl space-y-6">
				{/* Nav */}
				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 text-muted-foreground"
					onClick={() => navigate("/")}
				>
					<ArrowLeftIcon className="h-4 w-4" />
					Back to chat
				</Button>

				{/* Header */}
				<div>
					<h1 className="text-xl font-semibold">Settings</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						Manage your AI model, notifications, and workspace preferences
					</p>
				</div>

				{/* Tabs */}
				<div className="flex border-b border-border">
					{TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
								activeTab === tab.id
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{tab.icon}
							{tab.label}
						</button>
					))}
				</div>

				{/* Content */}
				<div className="rounded-lg border border-border bg-card p-6">
					{activeTab === "ai" && <AITab />}
					{activeTab === "notifications" && <NotificationsTab />}
					{activeTab === "memory" && <MemoryTab />}
					{activeTab === "theme" && <ThemeTab />}
				</div>
			</div>
		</div>
	);
}
