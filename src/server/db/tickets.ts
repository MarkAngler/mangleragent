import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import { appendPosition } from "../../shared/board";
import type { Ticket } from "../../shared/types";

interface TicketRow {
  id: string;
  project_id: string;
  title: string;
  body: string;
  column_id: string;
  position: number;
  labels_json: string;
  created_at: number;
  updated_at: number;
}

function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    columnId: row.column_id,
    position: row.position,
    labels: JSON.parse(row.labels_json) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const ticketsRepo = {
  listByProject(projectId: string): Ticket[] {
    const rows = db()
      .prepare("SELECT * FROM tickets WHERE project_id = ? ORDER BY column_id, position")
      .all(projectId) as TicketRow[];
    return rows.map(toTicket);
  },

  get(id: string): Ticket | undefined {
    const row = db().prepare("SELECT * FROM tickets WHERE id = ?").get(id) as TicketRow | undefined;
    return row ? toTicket(row) : undefined;
  },

  create(input: { projectId: string; title: string; body?: string; columnId: string }): Ticket {
    const positions = (
      db()
        .prepare("SELECT position FROM tickets WHERE project_id = ? AND column_id = ?")
        .all(input.projectId, input.columnId) as Array<{ position: number }>
    ).map((r) => r.position);
    const ts = now();
    const ticket: Ticket = {
      id: randomUUID(),
      projectId: input.projectId,
      title: input.title,
      body: input.body ?? "",
      columnId: input.columnId,
      position: appendPosition(positions),
      labels: [],
      createdAt: ts,
      updatedAt: ts,
    };
    db()
      .prepare(
        "INSERT INTO tickets (id, project_id, title, body, column_id, position, labels_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        ticket.id,
        ticket.projectId,
        ticket.title,
        ticket.body,
        ticket.columnId,
        ticket.position,
        JSON.stringify(ticket.labels),
        ticket.createdAt,
        ticket.updatedAt,
      );
    return ticket;
  },

  update(id: string, patch: { title?: string; body?: string; labels?: string[] }): Ticket | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: Ticket = {
      ...existing,
      title: patch.title ?? existing.title,
      body: patch.body ?? existing.body,
      labels: patch.labels ?? existing.labels,
      updatedAt: now(),
    };
    db()
      .prepare("UPDATE tickets SET title = ?, body = ?, labels_json = ?, updated_at = ? WHERE id = ?")
      .run(next.title, next.body, JSON.stringify(next.labels), next.updatedAt, id);
    return next;
  },

  move(id: string, columnId: string, position: number): Ticket | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const updatedAt = now();
    db()
      .prepare("UPDATE tickets SET column_id = ?, position = ?, updated_at = ? WHERE id = ?")
      .run(columnId, position, updatedAt, id);
    return { ...existing, columnId, position, updatedAt };
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM tickets WHERE id = ?").run(id).changes > 0;
  },
};
