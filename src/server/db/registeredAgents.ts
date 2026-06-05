import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { AgentProvider, RegisteredAgent } from "../../shared/types";

interface AgentRow {
  id: string;
  provider: AgentProvider;
  name: string;
  endpoint: string;
  description: string;
  created_at: number;
  updated_at: number;
}

function toAgent(row: AgentRow): RegisteredAgent {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    endpoint: row.endpoint,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const registeredAgentsRepo = {
  list(): RegisteredAgent[] {
    return (db().prepare("SELECT * FROM registered_agents ORDER BY created_at DESC").all() as AgentRow[]).map(toAgent);
  },

  get(id: string): RegisteredAgent | undefined {
    const row = db().prepare("SELECT * FROM registered_agents WHERE id = ?").get(id) as AgentRow | undefined;
    return row ? toAgent(row) : undefined;
  },

  create(input: { provider?: AgentProvider; name: string; endpoint: string; description?: string }): RegisteredAgent {
    const ts = now();
    const agent: RegisteredAgent = {
      id: randomUUID(),
      provider: input.provider ?? "databricks",
      name: input.name,
      endpoint: input.endpoint,
      description: input.description ?? "",
      createdAt: ts,
      updatedAt: ts,
    };
    db()
      .prepare(
        "INSERT INTO registered_agents (id, provider, name, endpoint, description, created_at, updated_at) VALUES (@id, @provider, @name, @endpoint, @description, @createdAt, @updatedAt)",
      )
      .run(agent);
    return agent;
  },

  update(id: string, patch: { name?: string; endpoint?: string; description?: string }): RegisteredAgent | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: RegisteredAgent = {
      ...existing,
      name: patch.name ?? existing.name,
      endpoint: patch.endpoint ?? existing.endpoint,
      description: patch.description ?? existing.description,
      updatedAt: now(),
    };
    db()
      .prepare("UPDATE registered_agents SET name = ?, endpoint = ?, description = ?, updated_at = ? WHERE id = ?")
      .run(next.name, next.endpoint, next.description, next.updatedAt, id);
    return next;
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM registered_agents WHERE id = ?").run(id).changes > 0;
  },
};
