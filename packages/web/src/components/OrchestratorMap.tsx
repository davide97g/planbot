import { useMemo } from "react";
import {
  ReactFlow,
  type Node,
  type Edge,
  Position,
  Handle,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Custom node component — dark-mode high-contrast
// ---------------------------------------------------------------------------

type MapNodeData = {
  label: string;
  description?: string;
  icon?: string;
  bg: string;
  border: string;
  text: string;
  items?: string[];
  nodeCategory: "entry" | "agent" | "tool" | "integration" | "command" | "storage";
};

function MapNode({ data }: NodeProps<Node<MapNodeData>>) {
  const isAgent = data.nodeCategory === "agent";
  const isTool = data.nodeCategory === "tool";
  const isEntry = data.nodeCategory === "entry";
  const isCommand = data.nodeCategory === "command";
  const isStorage = data.nodeCategory === "storage";

  const handleStyle = { borderColor: data.border, background: data.border };

  return (
    <div
      className="relative rounded-xl shadow-lg transition-shadow hover:shadow-2xl"
      style={{
        background: data.bg,
        border: `2px solid ${data.border}`,
        minWidth: isAgent ? 210 : isTool ? 170 : 150,
        maxWidth: isAgent ? 280 : 230,
        color: data.text,
      }}
    >
      {/* Handles */}
      {!isEntry && (
        <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !border-2" style={handleStyle} />
      )}
      {!isStorage && (
        <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !border-2" style={handleStyle} />
      )}
      <Handle type="target" position={Position.Left} id="left" className="!w-2 !h-2 !border-2" style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" className="!w-2 !h-2 !border-2" style={handleStyle} />

      <div className="px-3 py-2.5">
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {data.icon && <span className="text-sm">{data.icon}</span>}
          <span className={`font-bold leading-tight ${isAgent ? "text-sm" : "text-xs"}`}>
            {data.label}
          </span>
          {isCommand && (
            <span
              className="ml-auto text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold"
              style={{ background: data.border, color: data.bg }}
            >
              cmd
            </span>
          )}
          {isEntry && (
            <span
              className="ml-auto text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold"
              style={{ background: data.border, color: data.bg }}
            >
              entry
            </span>
          )}
        </div>

        {data.description && (
          <p className="text-[10px] leading-snug mb-1" style={{ color: data.text, opacity: 0.75 }}>
            {data.description}
          </p>
        )}

        {/* Tool/item list */}
        {data.items && data.items.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {data.items.map((item) => (
              <div
                key={item}
                className="text-[9px] font-mono px-1.5 py-0.5 rounded truncate font-medium"
                style={{ background: `${data.border}30`, color: data.text }}
              >
                {item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { mapNode: MapNode };

// ---------------------------------------------------------------------------
// Color palette — dark backgrounds, bright borders, white/light text
// ---------------------------------------------------------------------------

const C = {
  entry:       { bg: "#0c2d48", border: "#38bdf8", text: "#e0f2fe" },  // sky
  chatHandler: { bg: "#422006", border: "#facc15", text: "#fef9c3" },  // amber
  command:     { bg: "#2e1065", border: "#c084fc", text: "#f3e8ff" },  // violet
  orchestrator:{ bg: "#052e16", border: "#34d399", text: "#d1fae5" },  // emerald
  agent:       { bg: "#172554", border: "#60a5fa", text: "#dbeafe" },  // blue
  runner:      { bg: "#431407", border: "#fb923c", text: "#ffedd5" },  // orange
  llm:         { bg: "#4a044e", border: "#e879f9", text: "#fae8ff" },  // fuchsia
  integration: { bg: "#14532d", border: "#4ade80", text: "#dcfce7" },  // green
  storage:     { bg: "#1c1917", border: "#a8a29e", text: "#e7e5e4" },  // stone
  cron:        { bg: "#450a0a", border: "#f87171", text: "#fee2e2" },  // red
};

// ---------------------------------------------------------------------------
// Graph data
// ---------------------------------------------------------------------------

function buildGraph() {
  const nodes: Node<MapNodeData>[] = [
    // === Entry points ===
    {
      id: "user", type: "mapNode", position: { x: 400, y: 0 },
      data: {
        label: "User Message", description: "Chat input, slash commands, @mentions",
        icon: "💬", ...C.entry, nodeCategory: "entry",
      },
    },
    {
      id: "chat-handler", type: "mapNode", position: { x: 370, y: 120 },
      data: {
        label: "Chat Handler", description: "SSE streaming, mention resolution, memory loading",
        icon: "⚡", ...C.chatHandler,
        items: ["parseMentions", "resolveMentions", "loadMemory", "parseSlashCommand"],
        nodeCategory: "entry",
      },
    },

    // === Slash commands ===
    {
      id: "cmd-plan", type: "mapNode", position: { x: 20, y: 280 },
      data: { label: "/plan", description: "Project & release planning", icon: "📋", ...C.command, nodeCategory: "command" },
    },
    {
      id: "cmd-jira", type: "mapNode", position: { x: 170, y: 280 },
      data: { label: "/jira", description: "Jira search & analysis", icon: "🔍", ...C.command, nodeCategory: "command" },
    },
    {
      id: "cmd-confluence", type: "mapNode", position: { x: 310, y: 280 },
      data: { label: "/confluence", description: "Confluence doc search", icon: "📄", ...C.command, nodeCategory: "command" },
    },
    {
      id: "cmd-report", type: "mapNode", position: { x: 470, y: 280 },
      data: { label: "/report", description: "Release recap to Slack", icon: "📊", ...C.command, nodeCategory: "command" },
    },
    {
      id: "cmd-sprint-review", type: "mapNode", position: { x: 620, y: 280 },
      data: { label: "/sprint-review", description: "Sprint velocity & review", icon: "🏃", ...C.command, nodeCategory: "command" },
    },
    {
      id: "cmd-help", type: "mapNode", position: { x: 790, y: 280 },
      data: { label: "/help", description: "Show help text", icon: "❓", ...C.command, nodeCategory: "command" },
    },

    // === Orchestrator ===
    {
      id: "orchestrator", type: "mapNode", position: { x: 350, y: 440 },
      data: {
        label: "Orchestrator",
        description: "Master router — delegates to specialists, manages memory & tasks",
        icon: "🧠", ...C.orchestrator,
        items: ["delegate_planning", "delegate_jira", "delegate_confluence", "delegate_reporting", "create_task", "remember_fact", "recall_memory"],
        nodeCategory: "agent",
      },
    },

    // === Specialist agents ===
    {
      id: "planning-agent", type: "mapNode", position: { x: 30, y: 650 },
      data: {
        label: "Planning Agent", description: "Plans, sprints, capacity analysis",
        icon: "📋", ...C.agent,
        items: ["search_jira_issues", "get_team_capacity", "search_confluence_pages", "generate_plan"],
        nodeCategory: "agent",
      },
    },
    {
      id: "jira-agent", type: "mapNode", position: { x: 260, y: 650 },
      data: {
        label: "Jira Agent", description: "Issue search, sprint analysis",
        icon: "🔍", ...C.agent,
        items: ["search_jira_issues", "get_issue", "search_by_version", "get_active_sprint"],
        nodeCategory: "agent",
      },
    },
    {
      id: "confluence-agent", type: "mapNode", position: { x: 490, y: 650 },
      data: {
        label: "Confluence Agent", description: "Doc search & summarization",
        icon: "📄", ...C.agent,
        items: ["search_confluence_pages", "get_confluence_page"],
        nodeCategory: "agent",
      },
    },
    {
      id: "reporting-agent", type: "mapNode", position: { x: 700, y: 650 },
      data: {
        label: "Reporting Agent", description: "Release recaps, sprint reviews, velocity",
        icon: "📊", ...C.agent,
        items: ["search_jira_issues", "search_by_version", "get_sprint_details", "get_sprint_velocity", "send_slack_message"],
        nodeCategory: "agent",
      },
    },

    // === Runner ===
    {
      id: "runner", type: "mapNode", position: { x: 370, y: 840 },
      data: {
        label: "Agent Runner", description: "Core agentic loop — LLM calls, tool execution, max 10 iterations",
        icon: "🔄", ...C.runner,
        items: ["executeToolCall", "SSE streaming"],
        nodeCategory: "entry",
      },
    },

    // === LLM Provider ===
    {
      id: "llm-provider", type: "mapNode", position: { x: 130, y: 990 },
      data: {
        label: "LLM Provider", description: "OpenAI (gpt-4o) or Anthropic (Claude)",
        icon: "🤖", ...C.llm,
        items: ["OpenAI API", "Anthropic API"],
        nodeCategory: "integration",
      },
    },

    // === External integrations ===
    {
      id: "jira-api", type: "mapNode", position: { x: 370, y: 990 },
      data: { label: "Jira Cloud API", description: "Issue search, agile sprints, velocity", icon: "🏢", ...C.integration, nodeCategory: "integration" },
    },
    {
      id: "confluence-api", type: "mapNode", position: { x: 560, y: 990 },
      data: { label: "Confluence API", description: "Page search & content", icon: "📘", ...C.integration, nodeCategory: "integration" },
    },
    {
      id: "slack-api", type: "mapNode", position: { x: 740, y: 990 },
      data: { label: "Slack API", description: "Messages, DMs, channels", icon: "💬", ...C.integration, nodeCategory: "integration" },
    },

    // === Storage ===
    {
      id: "kv-config", type: "mapNode", position: { x: 100, y: 1130 },
      data: { label: "PLANBOT_CONFIG KV", description: "Auth, memory, notifications, velocity", icon: "💾", ...C.storage, nodeCategory: "storage" },
    },
    {
      id: "kv-chat", type: "mapNode", position: { x: 340, y: 1130 },
      data: { label: "PLANBOT_CHAT KV", description: "Conversation history", icon: "💾", ...C.storage, nodeCategory: "storage" },
    },
    {
      id: "r2-files", type: "mapNode", position: { x: 570, y: 1130 },
      data: { label: "PLANBOT_FILES R2", description: "File attachments", icon: "📁", ...C.storage, nodeCategory: "storage" },
    },

    // === Cron / Notifications ===
    {
      id: "cron", type: "mapNode", position: { x: 800, y: 0 },
      data: {
        label: "Cron Trigger", description: "Weekdays 7/8/9 UTC",
        icon: "⏰", ...C.cron,
        items: ["scheduler", "digest", "delivery"],
        nodeCategory: "entry",
      },
    },
    {
      id: "notifications", type: "mapNode", position: { x: 800, y: 150 },
      data: {
        label: "Notification System", description: "Daily digest, risk alerts, sprint boundaries",
        icon: "🔔", ...C.cron,
        items: ["buildDailyDigest", "buildRiskAlerts", "checkSprintBoundaries"],
        nodeCategory: "integration",
      },
    },
  ];

  const mk = (color: string, width = 1.5, dashed = false) => ({
    animated: !dashed,
    style: {
      strokeWidth: width,
      stroke: color,
      ...(dashed ? { strokeDasharray: "6,4" } : {}),
    },
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
    labelStyle: { fill: color, fontWeight: 600, fontSize: 11 },
    labelBgStyle: { fill: "#111", fillOpacity: 0.85 },
    labelBgPadding: [6, 3] as [number, number],
    labelBgBorderRadius: 4,
  });

  const edges: Edge[] = [
    // User → Chat Handler
    { id: "e-user-chat", source: "user", target: "chat-handler", ...mk("#38bdf8", 2) },

    // Chat Handler → Commands
    { id: "e-ch-plan", source: "chat-handler", target: "cmd-plan", label: "/plan", ...mk("#c084fc") },
    { id: "e-ch-jira", source: "chat-handler", target: "cmd-jira", label: "/jira", ...mk("#c084fc") },
    { id: "e-ch-conf", source: "chat-handler", target: "cmd-confluence", label: "/confluence", ...mk("#c084fc") },
    { id: "e-ch-report", source: "chat-handler", target: "cmd-report", label: "/report", ...mk("#c084fc") },
    { id: "e-ch-sprint", source: "chat-handler", target: "cmd-sprint-review", label: "/sprint-review", ...mk("#c084fc") },
    { id: "e-ch-help", source: "chat-handler", target: "cmd-help", label: "/help", ...mk("#c084fc") },

    // Chat Handler → Orchestrator (default route)
    { id: "e-ch-orch", source: "chat-handler", target: "orchestrator", label: "default", ...mk("#34d399", 3) },

    // Commands → Agents (bypass orchestrator)
    { id: "e-cmd-plan-agent", source: "cmd-plan", target: "planning-agent", ...mk("#c084fc") },
    { id: "e-cmd-jira-agent", source: "cmd-jira", target: "jira-agent", ...mk("#c084fc") },
    { id: "e-cmd-conf-agent", source: "cmd-confluence", target: "confluence-agent", ...mk("#c084fc") },
    { id: "e-cmd-report-agent", source: "cmd-report", target: "reporting-agent", ...mk("#c084fc") },
    { id: "e-cmd-sprint-agent", source: "cmd-sprint-review", target: "reporting-agent", ...mk("#c084fc") },

    // Orchestrator → Specialist agents (delegation)
    { id: "e-orch-plan", source: "orchestrator", target: "planning-agent", label: "delegate", ...mk("#60a5fa", 2) },
    { id: "e-orch-jira", source: "orchestrator", target: "jira-agent", label: "delegate", ...mk("#60a5fa", 2) },
    { id: "e-orch-conf", source: "orchestrator", target: "confluence-agent", label: "delegate", ...mk("#60a5fa", 2) },
    { id: "e-orch-report", source: "orchestrator", target: "reporting-agent", label: "delegate", ...mk("#60a5fa", 2) },

    // All agents → Runner
    { id: "e-plan-runner", source: "planning-agent", target: "runner", ...mk("#fb923c") },
    { id: "e-jira-runner", source: "jira-agent", target: "runner", ...mk("#fb923c") },
    { id: "e-conf-runner", source: "confluence-agent", target: "runner", ...mk("#fb923c") },
    { id: "e-report-runner", source: "reporting-agent", target: "runner", ...mk("#fb923c") },

    // Runner → LLM + APIs
    { id: "e-runner-llm", source: "runner", target: "llm-provider", label: "LLM calls", ...mk("#e879f9", 2) },
    { id: "e-runner-jira", source: "runner", target: "jira-api", label: "tool exec", ...mk("#4ade80") },
    { id: "e-runner-confluence", source: "runner", target: "confluence-api", label: "tool exec", ...mk("#4ade80") },
    { id: "e-runner-slack", source: "runner", target: "slack-api", label: "tool exec", ...mk("#4ade80") },

    // Storage connections (dashed, non-animated)
    { id: "e-runner-kv-config", source: "runner", target: "kv-config", ...mk("#a8a29e", 1.5, true) },
    { id: "e-ch-kv-chat", source: "chat-handler", target: "kv-chat", ...mk("#a8a29e", 1.5, true) },
    { id: "e-ch-r2", source: "chat-handler", target: "r2-files", ...mk("#a8a29e", 1.5, true) },

    // Cron → Notifications → Slack
    { id: "e-cron-notif", source: "cron", target: "notifications", ...mk("#f87171", 2) },
    { id: "e-notif-slack", source: "notifications", target: "slack-api", sourceHandle: "right", targetHandle: "left", label: "DMs", ...mk("#f87171") },
    { id: "e-notif-jira", source: "notifications", target: "jira-api", label: "queries", ...mk("#f87171") },
    { id: "e-notif-kv", source: "notifications", target: "kv-config", label: "prefs", ...mk("#a8a29e", 1.5, true) },
  ];

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OrchestratorMap() {
  const navigate = useNavigate();
  const { nodes: initialNodes, edges: initialEdges } = useMemo(buildGraph, []);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="flex h-screen flex-col" style={{ background: "#0a0a0a" }}>
      <header className="flex items-center gap-3 border-b px-4 py-3 shrink-0" style={{ borderColor: "#262626", background: "#0a0a0a" }}>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          style={{ color: "#a1a1aa" }}
          onClick={() => navigate("/")}
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to chat
        </Button>
        <h1 className="text-sm font-semibold" style={{ color: "#e4e4e7" }}>
          Orchestrator Architecture Map
        </h1>
      </header>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ background: "#0a0a0a" }}
        >
          <Background gap={24} size={1} color="#1a1a2e" />
          <Controls
            showInteractive={false}
            style={{ background: "#1c1c1c", borderColor: "#333", borderRadius: 8 }}
          />
          <MiniMap
            nodeStrokeWidth={2}
            pannable
            zoomable
            style={{ height: 110, width: 170, background: "#111", borderRadius: 8, border: "1px solid #333" }}
            maskColor="rgba(0,0,0,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
