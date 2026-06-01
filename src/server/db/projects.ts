import { randomUUID } from "node:crypto";
import path from "node:path";
import { db, now } from "./index";
import { DEFAULT_COLUMNS, type Column, type Project } from "../../shared/types";

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  description: string;
  columns_json: string;
  settings_json: string;
  created_at: number;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description,
    columns: JSON.parse(row.columns_json) as Column[],
    settings: JSON.parse(row.settings_json) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

export const projectsRepo = {
  list(): Project[] {
    const rows = db().prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as ProjectRow[];
    return rows.map(toProject);
  },

  get(id: string): Project | undefined {
    const row = db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRow | undefined;
    return row ? toProject(row) : undefined;
  },

  findByPath(absPath: string): Project | undefined {
    const row = db().prepare("SELECT * FROM projects WHERE path = ?").get(absPath) as ProjectRow | undefined;
    return row ? toProject(row) : undefined;
  },

  create(input: { path: string; name?: string; description?: string }): Project {
    const project: Project = {
      id: randomUUID(),
      name: input.name?.trim() || path.basename(input.path) || input.path,
      path: input.path,
      description: input.description ?? "",
      columns: DEFAULT_COLUMNS,
      settings: {},
      createdAt: now(),
    };
    db()
      .prepare(
        "INSERT INTO projects (id, name, path, description, columns_json, settings_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        project.id,
        project.name,
        project.path,
        project.description,
        JSON.stringify(project.columns),
        JSON.stringify(project.settings),
        project.createdAt,
      );
    return project;
  },

  update(id: string, patch: { description?: string }): Project | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: Project = { ...existing, description: patch.description ?? existing.description };
    db().prepare("UPDATE projects SET description = ? WHERE id = ?").run(next.description, id);
    return next;
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM projects WHERE id = ?").run(id).changes > 0;
  },
};
