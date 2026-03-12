export interface JiraIssue {
  key: string;
  summary: string;
  assignee: string | null;
  storyPoints: number | null;
  status: string;
  issueType: string;
  priority: string;
  fixVersions: string[];
  sprint: string | null;
  dependencies: string[]; // linked issue keys
  labels: string[];
  created: string;
  updated: string;
}

export interface ConfluencePage {
  id: string;
  title: string;
  bodyText: string;
  labels: string[];
  url?: string;
}

export interface SlackMessage {
  text: string;
  user: string;
  channel: string;
  timestamp: string;
  permalink: string;
}

export type PlanCommand = "release" | "sprint" | "jql" | "help";

export interface PlanningJob {
  command: PlanCommand;
  args: string;
  flags: {
    team?: string;
    from?: string;
    to?: string;
  };
  response_url: string;
  channel_id: string;
  user_id: string;
  team_config_name: string;
}

export interface TeamMember {
  name: string;
  capacity_hours_per_day: number;
  skills: string[];
}

export interface TeamCapacity {
  team_name: string;
  members: TeamMember[];
  holidays: string[]; // ISO date strings
  sprint_length_days: number;
}

export interface PlannedTask {
  key: string;
  summary: string;
  stream: string;
  owner: string;
  start_date: string;
  due_date: string;
  bdg: number; // budget (story points or hours)
  act: number; // actual spent
  etc: number; // estimate to complete
  eac: number; // estimate at completion
  diff: number; // BDG - EAC
  status: "on_track" | "at_risk" | "blocked" | "completed";
  dependencies: string[];
}

export interface Risk {
  type: "blocker" | "overload" | "dependency" | "timeline" | "scope";
  severity: "high" | "medium" | "low";
  description: string;
  affected_tasks: string[];
  mitigation: string;
}

export interface PlanningResult {
  title: string;
  generated_at: string;
  horizon: { from: string; to: string };
  tasks: PlannedTask[];
  risks: Risk[];
  summary: {
    total_tasks: number;
    team_size: number;
    at_risk_count: number;
    blocked_count: number;
    completion_confidence: number; // 0-100
  };
}

export interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: { type: string; text: string }[];
  elements?: { type: string; text: string }[];
}

export interface Env {
  PLANBOT_QUEUE: Queue<PlanningJob>;
  PLANBOT_CONFIG: KVNamespace;
  PLANBOT_CHAT: KVNamespace;
  PLANBOT_FILES: R2Bucket;
  SLACK_SIGNING_SECRET: string;
  SLACK_BOT_TOKEN: string;
  JIRA_BASE_URL: string;
  JIRA_EMAIL: string;
  JIRA_API_TOKEN: string;
  CONFLUENCE_BASE_URL: string;
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  AUTH_SECRET: string;
  AUTH_TEAM_PASSWORD: string;
  LLM_PROVIDER: string;
  ATLASSIAN_CLIENT_ID: string;
  ATLASSIAN_CLIENT_SECRET: string;
  ATLASSIAN_REDIRECT_URI: string;
}

export interface AtlassianTokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // unix seconds
  cloudId: string;
}

// ---------------------------------------------------------------------------
// User memory (cross-conversation context)
// ---------------------------------------------------------------------------

export interface UserMemoryProject {
  key: string;
  name: string;
  board?: string;
  lastMentioned: string; // ISO date
}

export interface UserMemoryFact {
  text: string;
  source: "user" | "agent";
  createdAt: string; // ISO date
}

export interface UserMemoryPlanOutcome {
  title: string;
  date: string; // ISO date
  notes?: string;
}

/** A single named memory bank entry — the normalized format used in the UI. */
export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  category: "fact" | "preference" | "project" | "team" | "plan_outcome";
  /** true = always injected into every system prompt; false = only injected when @memory:id is mentioned */
  alwaysInclude: boolean;
  createdAt: string; // ISO date
  source: "user" | "agent";
}

export interface UserMemory {
  projects: UserMemoryProject[];
  preferences: Record<string, unknown>;
  facts: UserMemoryFact[];
  planOutcomes: UserMemoryPlanOutcome[];
  teamContext: {
    members: string[];
    roles: Record<string, string>;
  };
  /** Normalized flat list used by the Memory page and @memory: mentions */
  entries: MemoryEntry[];
}

// ---------------------------------------------------------------------------
// File attachments
// ---------------------------------------------------------------------------

export interface FileAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string; // R2 public URL or signed URL
}

// ---------------------------------------------------------------------------
// Notification preferences
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
  enabled: boolean;
  slackUserId: string;
  dailyDigest: {
    enabled: boolean;
    time: string; // HH:MM
    timezone: string;
  };
  sprintAlerts: { enabled: boolean };
  riskAlerts: { enabled: boolean; threshold: "high" | "medium" | "low" };
}

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  contentParts?: LLMContentPart[]; // multipart content (text + images) for LLM
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  agentName?: string;
  mentions?: Mention[];
  attachments?: FileAttachment[];
  timestamp: string;
}

export interface Mention {
  type: "jira" | "confluence" | "memory" | "slack" | "sprint";
  id: string;
  display: string;
  resolved?: { summary?: string; status?: string; url?: string };
}

export interface ChatConversation {
  id: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  aiTitleGenerated?: boolean;
}

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Agent types
// ---------------------------------------------------------------------------

export interface AgentContext {
  env: Env;
  userId?: string;
  conversationId: string;
  messages: ChatMessage[];
  abortSignal?: AbortSignal;
  memory?: UserMemory;
}

export interface Agent {
  name: string;
  description: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  run(context: AgentContext): AsyncIterable<SSEEvent>;
}

// ---------------------------------------------------------------------------
// SSE event types
// ---------------------------------------------------------------------------

export type SSEEvent =
  | { type: "token"; data: { content: string; agentName?: string } }
  | { type: "tool_call_start"; data: { toolCall: ToolCall; agentName?: string } }
  | { type: "tool_call_result"; data: { result: ToolResult; agentName?: string } }
  | { type: "agent_switch"; data: { from: string; to: string } }
  | { type: "done"; data: { message: ChatMessage } }
  | { type: "error"; data: { message: string; code?: string } }
  | { type: "title_update"; data: { title: string } }
  | { type: "task_create"; data: { title: string } };

// ---------------------------------------------------------------------------
// LLM Provider types
// ---------------------------------------------------------------------------

export type StreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; content: string; toolCalls: ToolCall[] };

export interface LLMProvider {
  chat(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options?: LLMOptions,
  ): AsyncIterable<StreamEvent>;
}

export type LLMContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }; // data is base64

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LLMContentPart[];
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}
