import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { CreateMcpServerInput, McpServer, McpTransport, UpdateMcpServerInput } from "../../shared/types";

interface McpServerRow {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args_json: string;
  env_json: string;
  url: string;
  headers_json: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function toMcpServer(row: McpServerRow): McpServer {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    command: row.command,
    args: JSON.parse(row.args_json) as string[],
    env: JSON.parse(row.env_json) as Record<string, string>,
    url: row.url,
    headers: JSON.parse(row.headers_json) as Record<string, string>,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const mcpServersRepo = {
  list(): McpServer[] {
    return (db().prepare("SELECT * FROM mcp_servers ORDER BY created_at DESC").all() as McpServerRow[]).map(toMcpServer);
  },

  listEnabled(): McpServer[] {
    return (db().prepare("SELECT * FROM mcp_servers WHERE enabled = 1 ORDER BY created_at DESC").all() as McpServerRow[]).map(toMcpServer);
  },

  get(id: string): McpServer | undefined {
    const row = db().prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as McpServerRow | undefined;
    return row ? toMcpServer(row) : undefined;
  },

  create(input: CreateMcpServerInput): McpServer {
    const ts = now();
    const server: McpServer = {
      id: randomUUID(),
      name: input.name,
      transport: input.transport,
      command: input.command ?? "",
      args: input.args ?? [],
      env: input.env ?? {},
      url: input.url ?? "",
      headers: input.headers ?? {},
      enabled: input.enabled ?? true,
      createdAt: ts,
      updatedAt: ts,
    };
    db()
      .prepare(
        "INSERT INTO mcp_servers (id, name, transport, command, args_json, env_json, url, headers_json, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        server.id,
        server.name,
        server.transport,
        server.command,
        JSON.stringify(server.args),
        JSON.stringify(server.env),
        server.url,
        JSON.stringify(server.headers),
        server.enabled ? 1 : 0,
        server.createdAt,
        server.updatedAt,
      );
    return server;
  },

  update(id: string, patch: UpdateMcpServerInput): McpServer | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: McpServer = {
      ...existing,
      name: patch.name ?? existing.name,
      transport: patch.transport ?? existing.transport,
      command: patch.command ?? existing.command,
      args: patch.args ?? existing.args,
      env: patch.env ?? existing.env,
      url: patch.url ?? existing.url,
      headers: patch.headers ?? existing.headers,
      enabled: patch.enabled ?? existing.enabled,
      updatedAt: now(),
    };
    db()
      .prepare(
        "UPDATE mcp_servers SET name = ?, transport = ?, command = ?, args_json = ?, env_json = ?, url = ?, headers_json = ?, enabled = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        next.name,
        next.transport,
        next.command,
        JSON.stringify(next.args),
        JSON.stringify(next.env),
        next.url,
        JSON.stringify(next.headers),
        next.enabled ? 1 : 0,
        next.updatedAt,
        id,
      );
    return next;
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM mcp_servers WHERE id = ?").run(id).changes > 0;
  },
};
