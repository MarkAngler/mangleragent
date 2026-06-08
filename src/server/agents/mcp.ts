import type Anthropic from "@anthropic-ai/sdk";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { mcpServersRepo } from "../db/mcpServers";
import type { McpServer } from "../../shared/types";

// Tools exposed by registered MCP servers are namespaced so the model can target a
// specific server, and so they never collide with Mangler's built-in tool names.
const PREFIX = "mcp__";

export function sanitizeMcpName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// Anthropic tool names must match ^[a-zA-Z0-9_-]{1,128}$.
export function mcpToolName(serverName: string, toolName: string): string {
  return `${PREFIX}${sanitizeMcpName(serverName)}__${sanitizeMcpName(toolName)}`.slice(0, 128);
}

export interface McpToolset {
  tools: Anthropic.Tool[];
  has(name: string): boolean;
  call(name: string, input: unknown): Promise<unknown>;
}

// The SDK's FetchLike signature; redeclared to avoid depending on an internal subpath.
type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

function buildTransport(server: McpServer) {
  if (server.transport === "stdio") {
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: { ...getDefaultEnvironment(), ...server.env },
    });
  }
  const url = new URL(server.url);
  const opts = remoteOpts(server.headers);
  return server.transport === "sse" ? new SSEClientTransport(url, opts) : new StreamableHTTPClientTransport(url, opts);
}

// Inject the configured auth headers into every request the transport makes. A custom
// fetch covers both the GET stream and the POST channel for HTTP and SSE alike.
function remoteOpts(headers: Record<string, string>): { fetch: FetchLike } | undefined {
  if (Object.keys(headers).length === 0) return undefined;
  const authedFetch: FetchLike = (url, init) => {
    const merged = new Headers(init?.headers);
    for (const [key, value] of Object.entries(headers)) merged.set(key, value);
    return fetch(url, { ...init, headers: merged });
  };
  return { fetch: authedFetch };
}

interface Cached {
  client: Client;
  fingerprint: string;
}

// Process-wide connection cache: stdio servers spawn a child process and perform a
// handshake, so connecting once per Mangler turn would be wasteful. Entries are keyed
// by server id and re-established when the server's config (its fingerprint) changes.
const cache = new Map<string, Cached>();

function fingerprintOf(server: McpServer): string {
  return JSON.stringify({
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: server.env,
    url: server.url,
    headers: server.headers,
  });
}

async function connect(server: McpServer): Promise<Client> {
  const client = new Client({ name: "mangled-agents", version: "0.1.0" });
  await client.connect(buildTransport(server));
  return client;
}

async function ensureConnected(server: McpServer): Promise<Client> {
  const fingerprint = fingerprintOf(server);
  const existing = cache.get(server.id);
  if (existing && existing.fingerprint === fingerprint) return existing.client;
  if (existing) await closeQuietly(existing.client);
  const client = await connect(server);
  cache.set(server.id, { client, fingerprint });
  return client;
}

async function closeQuietly(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // A dead connection failing to close is expected; nothing to recover.
  }
}

// Drop and close the cached connection for a server. Called when a server is updated,
// disabled, or removed so the next turn reconnects with fresh config (or not at all).
export function invalidateMcpServer(serverId: string): void {
  const cached = cache.get(serverId);
  if (!cached) return;
  cache.delete(serverId);
  void closeQuietly(cached.client);
}

interface ToolCallResult {
  content?: unknown;
  isError?: boolean;
}

function isTextBlock(block: unknown): block is { type: "text"; text: string } {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { type?: unknown }).type === "text" &&
    typeof (block as { text?: unknown }).text === "string"
  );
}

function flattenResult(result: ToolCallResult): unknown {
  const blocks = Array.isArray(result.content) ? result.content : [];
  const text = blocks.filter(isTextBlock).map((block) => block.text).join("\n");
  if (result.isError) return { error: text || "mcp tool returned an error" };
  return { content: text };
}

// Connect to every enabled MCP server, list its tools, and expose them as namespaced
// Anthropic tools the Mangler loop can offer the model. A server that fails to connect
// or list is skipped with a logged error, never failing the whole turn.
export async function loadMcpToolset(): Promise<McpToolset> {
  const routes = new Map<string, { serverId: string; toolName: string }>();
  const tools: Anthropic.Tool[] = [];

  for (const server of mcpServersRepo.listEnabled()) {
    try {
      const client = await ensureConnected(server);
      const { tools: mcpTools } = await client.listTools();
      for (const tool of mcpTools) {
        const name = mcpToolName(server.name, tool.name);
        tools.push({ name, description: tool.description ?? "", input_schema: tool.inputSchema as Anthropic.Tool.InputSchema });
        routes.set(name, { serverId: server.id, toolName: tool.name });
      }
    } catch (err) {
      invalidateMcpServer(server.id);
      console.error(`[mcp] failed to load tools from "${server.name}": ${(err as Error).message}`);
    }
  }

  return {
    tools,
    has: (name) => routes.has(name),
    call: async (name, input) => {
      const route = routes.get(name);
      if (!route) return { error: `unknown mcp tool: ${name}` };
      const server = mcpServersRepo.get(route.serverId);
      if (!server) return { error: "mcp server not found" };
      try {
        const client = await ensureConnected(server);
        const result = await client.callTool({ name: route.toolName, arguments: (input ?? {}) as Record<string, unknown> });
        return flattenResult(result as ToolCallResult);
      } catch (err) {
        invalidateMcpServer(server.id);
        return { error: (err as Error).message };
      }
    },
  };
}

// Map the given stored MCP servers into the shape the Agent SDK's `mcpServers` option expects,
// keyed by sanitized server name. Used to grant a task agent exactly its configured servers.
// Unknown ids are skipped; servers needn't be enabled (an agent picks its own servers explicitly).
export function toSdkMcpServers(serverIds: string[]): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {};
  for (const id of serverIds) {
    const server = mcpServersRepo.get(id);
    if (!server) continue;
    const key = sanitizeMcpName(server.name);
    if (server.transport === "stdio") {
      result[key] = { type: "stdio", command: server.command, args: server.args, env: server.env };
    } else if (server.transport === "sse") {
      result[key] = { type: "sse", url: server.url, headers: server.headers };
    } else {
      result[key] = { type: "http", url: server.url, headers: server.headers };
    }
  }
  return result;
}

// Connect to a server outside the cache to verify its config and report its tools.
export async function testMcpServer(server: McpServer): Promise<{ toolNames: string[] }> {
  const client = await connect(server);
  try {
    const { tools } = await client.listTools();
    return { toolNames: tools.map((tool) => tool.name) };
  } finally {
    await closeQuietly(client);
  }
}
