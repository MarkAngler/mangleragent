import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { Task } from "../../shared/types";

interface TaskRow {
  id: string;
  project_id: string | null;
  title: string;
  done: number;
  due: number | null;
  created_at: number;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    done: row.done === 1,
    due: row.due,
    createdAt: row.created_at,
  };
}

export const tasksRepo = {
  list(): Task[] {
    return (db().prepare("SELECT * FROM tasks ORDER BY done, created_at DESC").all() as TaskRow[]).map(toTask);
  },

  get(id: string): Task | undefined {
    const row = db().prepare("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow | undefined;
    return row ? toTask(row) : undefined;
  },

  create(input: { projectId?: string | null; title: string; due?: number | null }): Task {
    const task: Task = {
      id: randomUUID(),
      projectId: input.projectId ?? null,
      title: input.title,
      done: false,
      due: input.due ?? null,
      createdAt: now(),
    };
    db()
      .prepare("INSERT INTO tasks (id, project_id, title, done, due, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(task.id, task.projectId, task.title, task.done ? 1 : 0, task.due, task.createdAt);
    return task;
  },

  update(id: string, patch: { title?: string; done?: boolean; due?: number | null }): Task | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: Task = {
      ...existing,
      title: patch.title ?? existing.title,
      done: patch.done ?? existing.done,
      due: patch.due === undefined ? existing.due : patch.due,
    };
    db().prepare("UPDATE tasks SET title = ?, done = ?, due = ? WHERE id = ?").run(next.title, next.done ? 1 : 0, next.due, id);
    return next;
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM tasks WHERE id = ?").run(id).changes > 0;
  },
};
