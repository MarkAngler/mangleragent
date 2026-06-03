import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { AgentRun, AgentRunKind, AgentRunStatus, Approver } from "../../shared/types";

interface RunRow {
  id: string;
  project_id: string | null;
  ticket_id: string | null;
  kind: AgentRunKind;
  title: string;
  status: AgentRunStatus;
  approver: Approver;
  permission_mode: string;
  model: string | null;
  sdk_session_id: string | null;
  cwd: string;
  agent_def: string | null;
  summary: string | null;
  created_at: number;
  ended_at: number | null;
}

function toRun(r: RunRow): AgentRun {
  return {
    id: r.id,
    projectId: r.project_id,
    ticketId: r.ticket_id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    approver: r.approver,
    permissionMode: r.permission_mode,
    model: r.model,
    sdkSessionId: r.sdk_session_id,
    cwd: r.cwd,
    agentDef: r.agent_def,
    summary: r.summary,
    createdAt: r.created_at,
    endedAt: r.ended_at,
  };
}

const TERMINAL: AgentRunStatus[] = ["done", "failed", "stopped"];

export const runsRepo = {
  list(): AgentRun[] {
    return (db().prepare("SELECT * FROM agent_runs ORDER BY created_at DESC").all() as RunRow[]).map(toRun);
  },

  get(id: string): AgentRun | undefined {
    const r = db().prepare("SELECT * FROM agent_runs WHERE id = ?").get(id) as RunRow | undefined;
    return r ? toRun(r) : undefined;
  },

  create(input: {
    projectId?: string | null;
    ticketId?: string | null;
    kind: AgentRunKind;
    title: string;
    status: AgentRunStatus;
    approver?: Approver;
    permissionMode?: string;
    model?: string | null;
    cwd: string;
    agentDef?: string | null;
  }): AgentRun {
    const run: AgentRun = {
      id: randomUUID(),
      projectId: input.projectId ?? null,
      ticketId: input.ticketId ?? null,
      kind: input.kind,
      title: input.title,
      status: input.status,
      approver: input.approver ?? "human",
      permissionMode: input.permissionMode ?? "plan",
      model: input.model ?? null,
      sdkSessionId: null,
      cwd: input.cwd,
      agentDef: input.agentDef ?? null,
      summary: null,
      createdAt: now(),
      endedAt: null,
    };
    db()
      .prepare(
        `INSERT INTO agent_runs (id, project_id, ticket_id, kind, title, status, approver, permission_mode, model, sdk_session_id, cwd, agent_def, summary, created_at, ended_at)
         VALUES (@id, @projectId, @ticketId, @kind, @title, @status, @approver, @permissionMode, @model, @sdkSessionId, @cwd, @agentDef, @summary, @createdAt, @endedAt)`,
      )
      .run(run);
    return run;
  },

  setStatus(id: string, status: AgentRunStatus): void {
    const endedAt = TERMINAL.includes(status) ? now() : null;
    db().prepare("UPDATE agent_runs SET status = ?, ended_at = COALESCE(?, ended_at) WHERE id = ?").run(status, endedAt, id);
  },

  setTitle(id: string, title: string): void {
    db().prepare("UPDATE agent_runs SET title = ? WHERE id = ?").run(title, id);
  },

  // PTY sessions live only in server memory; a restart orphans their 'running' rows. Reconcile
  // them to 'stopped' on boot so the list reflects reality (reconnecting revives them on demand).
  markRunningPtyStopped(): void {
    db().prepare("UPDATE agent_runs SET status = 'stopped', ended_at = COALESCE(ended_at, ?) WHERE kind = 'pty' AND status = 'running'").run(now());
  },

  setSessionId(id: string, sdkSessionId: string): void {
    db().prepare("UPDATE agent_runs SET sdk_session_id = ? WHERE id = ?").run(sdkSessionId, id);
  },

  setSummary(id: string, summary: string): void {
    db().prepare("UPDATE agent_runs SET summary = ? WHERE id = ?").run(summary, id);
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM agent_runs WHERE id = ?").run(id).changes > 0;
  },
};
