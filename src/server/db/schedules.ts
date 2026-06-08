import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { Schedule } from "../../shared/types";

interface ScheduleRow {
  id: string;
  title: string;
  prompt: string;
  cron: string;
  conversation_id: string | null;
  agent_id: string | null;
  enabled: number;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
}

function toSchedule(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    cron: row.cron,
    conversationId: row.conversation_id,
    agentId: row.agent_id,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const schedulesRepo = {
  list(): Schedule[] {
    return (db().prepare("SELECT * FROM schedules ORDER BY created_at DESC").all() as ScheduleRow[]).map(toSchedule);
  },

  get(id: string): Schedule | undefined {
    const row = db().prepare("SELECT * FROM schedules WHERE id = ?").get(id) as ScheduleRow | undefined;
    return row ? toSchedule(row) : undefined;
  },

  // Enabled schedules whose next fire time has arrived. Backed by idx_schedules_due.
  listDue(nowMs: number): Schedule[] {
    return (
      db()
        .prepare("SELECT * FROM schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at")
        .all(nowMs) as ScheduleRow[]
    ).map(toSchedule);
  },

  create(input: {
    title: string;
    prompt: string;
    cron: string;
    agentId?: string | null;
    enabled: boolean;
    nextRunAt: number | null;
  }): Schedule {
    const ts = now();
    const schedule: Schedule = {
      id: randomUUID(),
      title: input.title,
      prompt: input.prompt,
      cron: input.cron,
      conversationId: null,
      agentId: input.agentId ?? null,
      enabled: input.enabled,
      lastRunAt: null,
      nextRunAt: input.nextRunAt,
      createdAt: ts,
      updatedAt: ts,
    };
    db()
      .prepare(
        `INSERT INTO schedules (id, title, prompt, cron, conversation_id, agent_id, enabled, last_run_at, next_run_at, created_at, updated_at)
         VALUES (@id, @title, @prompt, @cron, @conversationId, @agentId, @enabled, @lastRunAt, @nextRunAt, @createdAt, @updatedAt)`,
      )
      .run({ ...schedule, enabled: schedule.enabled ? 1 : 0 });
    return schedule;
  },

  update(
    id: string,
    patch: { title?: string; prompt?: string; cron?: string; agentId?: string | null; enabled?: boolean; nextRunAt?: number | null },
  ): Schedule | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: Schedule = {
      ...existing,
      title: patch.title ?? existing.title,
      prompt: patch.prompt ?? existing.prompt,
      cron: patch.cron ?? existing.cron,
      agentId: "agentId" in patch ? (patch.agentId ?? null) : existing.agentId,
      enabled: patch.enabled ?? existing.enabled,
      nextRunAt: "nextRunAt" in patch ? (patch.nextRunAt ?? null) : existing.nextRunAt,
      updatedAt: now(),
    };
    db()
      .prepare("UPDATE schedules SET title = ?, prompt = ?, cron = ?, agent_id = ?, enabled = ?, next_run_at = ?, updated_at = ? WHERE id = ?")
      .run(next.title, next.prompt, next.cron, next.agentId, next.enabled ? 1 : 0, next.nextRunAt, next.updatedAt, id);
    return next;
  },

  // System updates that intentionally leave updated_at alone.
  markRan(id: string, lastRunAt: number): void {
    db().prepare("UPDATE schedules SET last_run_at = ? WHERE id = ?").run(lastRunAt, id);
  },

  setNextRun(id: string, nextRunAt: number | null): void {
    db().prepare("UPDATE schedules SET next_run_at = ? WHERE id = ?").run(nextRunAt, id);
  },

  setConversationId(id: string, conversationId: string): void {
    db().prepare("UPDATE schedules SET conversation_id = ? WHERE id = ?").run(conversationId, id);
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM schedules WHERE id = ?").run(id).changes > 0;
  },
};
