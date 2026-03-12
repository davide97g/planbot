import type { Env, ToolDefinition } from "../types";
import { createMCPClient, type MCPServerConfig } from "./client";

const KV_KEY = "mcp:servers";

export async function loadMCPServers(env: Env): Promise<MCPServerConfig[]> {
  const raw = await env.PLANBOT_CONFIG.get(KV_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as MCPServerConfig[];
  } catch {
    return [];
  }
}

export async function saveMCPServers(servers: MCPServerConfig[], env: Env): Promise<void> {
  await env.PLANBOT_CONFIG.put(KV_KEY, JSON.stringify(servers));
}

export async function discoverMCPTools(env: Env): Promise<ToolDefinition[]> {
  const servers = await loadMCPServers(env);
  if (servers.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    servers.map(async (serverConfig) => {
      const client = createMCPClient(serverConfig);
      try {
        const tools = await client.listTools();
        return tools.map((tool) => ({
          ...tool,
          name: `${serverConfig.name}__${tool.name}`,
        }));
      } finally {
        client.close();
      }
    }),
  );

  const allTools: ToolDefinition[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allTools.push(...result.value);
    } else {
      console.error("Failed to discover tools from MCP server:", result.reason);
    }
  }

  return allTools;
}
