import { db, now } from "./index";
import type { AgentEvent } from "../../shared/types";

interface EventRow {
  id: number;
  run_id: string;
  seq: number;
  type: string;
  payload_json: string;
  created_at: number;
}

function toEvent(r: EventRow): AgentEvent {
  return { id: r.id, runId: r.run_id, seq: r.seq, type: r.type, payload: JSON.parse(r.payload_json) as unknown, createdAt: r.created_at };
}

export const eventsRepo = {
  listByRun(runId: string): AgentEvent[] {
    return (db().prepare("SELECT * FROM agent_events WHERE run_id = ? ORDER BY seq").all(runId) as EventRow[]).map(toEvent);
  },

  add(runId: string, type: string, payload: unknown): AgentEvent {
    const row = db().prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM agent_events WHERE run_id = ?").get(runId) as {
      seq: number;
    };
    const createdAt = now();
    const info = db()
      .prepare("INSERT INTO agent_events (run_id, seq, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(runId, row.seq, type, JSON.stringify(payload), createdAt);
    return { id: Number(info.lastInsertRowid), runId, seq: row.seq, type, payload, createdAt };
  },
};
