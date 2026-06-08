import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { Agent, AgentApproval, AgentType, CreateAgentInput, UpdateAgentInput } from "../../shared/types";

interface AgentRow {
  id: string;
  type: AgentType;
  name: string;
  description: string;
  system_prompt: string;
  model: string | null;
  mcp_server_ids_json: string;
  approval: AgentApproval;
  created_at: number;
  updated_at: number;
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    systemPrompt: row.system_prompt,
    model: row.model,
    mcpServerIds: JSON.parse(row.mcp_server_ids_json) as string[],
    approval: row.approval,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const agentsRepo = {
  list(): Agent[] {
    return (db().prepare("SELECT * FROM agents ORDER BY created_at DESC").all() as AgentRow[]).map(toAgent);
  },

  get(id: string): Agent | undefined {
    const row = db().prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
    return row ? toAgent(row) : undefined;
  },

  create(input: CreateAgentInput): Agent {
    const ts = now();
    const agent: Agent = {
      id: randomUUID(),
      type: input.type ?? "task",
      name: input.name,
      description: input.description ?? "",
      systemPrompt: input.systemPrompt ?? "",
      model: input.model ?? null,
      mcpServerIds: input.mcpServerIds ?? [],
      approval: input.approval ?? "none",
      createdAt: ts,
      updatedAt: ts,
    };
    db()
      .prepare(
        `INSERT INTO agents (id, type, name, description, system_prompt, model, mcp_server_ids_json, approval, created_at, updated_at)
         VALUES (@id, @type, @name, @description, @systemPrompt, @model, @mcpServerIdsJson, @approval, @createdAt, @updatedAt)`,
      )
      .run({ ...agent, mcpServerIdsJson: JSON.stringify(agent.mcpServerIds) });
    return agent;
  },

  update(id: string, patch: UpdateAgentInput): Agent | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: Agent = {
      ...existing,
      type: patch.type ?? existing.type,
      name: patch.name ?? existing.name,
      description: patch.description ?? existing.description,
      systemPrompt: patch.systemPrompt ?? existing.systemPrompt,
      model: "model" in patch ? (patch.model ?? null) : existing.model,
      mcpServerIds: patch.mcpServerIds ?? existing.mcpServerIds,
      approval: patch.approval ?? existing.approval,
      updatedAt: now(),
    };
    db()
      .prepare(
        `UPDATE agents SET type = ?, name = ?, description = ?, system_prompt = ?, model = ?, mcp_server_ids_json = ?, approval = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.type,
        next.name,
        next.description,
        next.systemPrompt,
        next.model,
        JSON.stringify(next.mcpServerIds),
        next.approval,
        next.updatedAt,
        id,
      );
    return next;
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM agents WHERE id = ?").run(id).changes > 0;
  },
};
