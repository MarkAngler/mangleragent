import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { Note } from "../../shared/types";

interface NoteRow {
  id: string;
  project_id: string | null;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
}

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const notesRepo = {
  list(): Note[] {
    return (db().prepare("SELECT * FROM notes ORDER BY updated_at DESC").all() as NoteRow[]).map(toNote);
  },

  get(id: string): Note | undefined {
    const row = db().prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | undefined;
    return row ? toNote(row) : undefined;
  },

  create(input: { projectId?: string | null; title: string; body?: string }): Note {
    const ts = now();
    const note: Note = {
      id: randomUUID(),
      projectId: input.projectId ?? null,
      title: input.title,
      body: input.body ?? "",
      createdAt: ts,
      updatedAt: ts,
    };
    db()
      .prepare("INSERT INTO notes (id, project_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(note.id, note.projectId, note.title, note.body, note.createdAt, note.updatedAt);
    return note;
  },

  update(id: string, patch: { title?: string; body?: string }): Note | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: Note = {
      ...existing,
      title: patch.title ?? existing.title,
      body: patch.body ?? existing.body,
      updatedAt: now(),
    };
    db().prepare("UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?").run(next.title, next.body, next.updatedAt, id);
    return next;
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM notes WHERE id = ?").run(id).changes > 0;
  },
};
