import type { ToolDefinition } from "../types";

export interface MCPServerConfig {
  name: string;
  url: string;
  apiKey?: string;
}

export interface MCPClient {
  listTools(): Promise<ToolDefinition[]>;
  callTool(name: string, arguments: Record<string, unknown>): Promise<unknown>;
  close(): void;
}

interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface MCPToolEntry {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface MCPCallToolResult {
  content?: Array<{ type: string; text?: string }>;
}

export function createMCPClient(config: MCPServerConfig): MCPClient {
  const { url, apiKey } = config;
  let closed = false;

  async function rpc(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (closed) {
      throw new Error(`MCP client for "${config.name}" is closed`);
    }

    const endpoint = `${url.replace(/\/+$/, "")}/mcp`;
    const body: Record<string, unknown> = {
      jsonrpc: "2.0",
      method,
      id: Date.now(),
    };
    if (params) {
      body.params = params;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `MCP connection failed for "${config.name}" at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `MCP server "${config.name}" returned HTTP ${response.status}: ${await response.text().catch(() => "unknown")}`,
      );
    }

    let json: JSONRPCResponse;
    try {
      json = (await response.json()) as JSONRPCResponse;
    } catch {
      throw new Error(`MCP server "${config.name}" returned invalid JSON`);
    }

    if (json.error) {
      throw new Error(
        `MCP RPC error from "${config.name}": [${json.error.code}] ${json.error.message}`,
      );
    }

    return json.result;
  }

  return {
    async listTools(): Promise<ToolDefinition[]> {
      const result = (await rpc("tools/list")) as { tools?: MCPToolEntry[] } | undefined;
      const tools = result?.tools ?? [];

      return tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        parameters: t.inputSchema ?? {},
      }));
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
      const result = (await rpc("tools/call", { name, arguments: args })) as
        | MCPCallToolResult
        | undefined;

      const content = result?.content;
      if (!content || content.length === 0) {
        return null;
      }

      // If a single text entry, return the text directly
      if (content.length === 1 && content[0].type === "text") {
        return content[0].text ?? null;
      }

      // Multiple entries: concatenate text content
      const texts = content
        .filter((c) => c.type === "text" && c.text != null)
        .map((c) => c.text);

      return texts.length === 1 ? texts[0] : texts.join("\n");
    },

    close(): void {
      closed = true;
    },
  };
}
