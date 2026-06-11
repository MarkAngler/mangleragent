import { randomUUID } from "node:crypto";
import { db, now } from "./index";
import type { GithubSelection, GithubSource } from "../../shared/types";

interface GithubSourceRow {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  label: string;
  selections_json: string;
  last_synced_sha: string | null;
  last_synced_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

function toSource(row: GithubSourceRow): GithubSource {
  return {
    id: row.id,
    owner: row.owner,
    repo: row.repo,
    branch: row.branch,
    label: row.label,
    selections: JSON.parse(row.selections_json) as GithubSelection[],
    lastSyncedSha: row.last_synced_sha,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const githubSourcesRepo = {
  list(): GithubSource[] {
    return (db().prepare("SELECT * FROM github_sources ORDER BY created_at DESC").all() as GithubSourceRow[]).map(toSource);
  },

  get(id: string): GithubSource | undefined {
    const row = db().prepare("SELECT * FROM github_sources WHERE id = ?").get(id) as GithubSourceRow | undefined;
    return row ? toSource(row) : undefined;
  },

  create(input: { owner: string; repo: string; branch: string; label?: string; selections: GithubSelection[] }): GithubSource {
    const ts = now();
    const source: GithubSource = {
      id: randomUUID(),
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      label: input.label ?? "",
      selections: input.selections,
      lastSyncedSha: null,
      lastSyncedAt: null,
      lastError: null,
      createdAt: ts,
      updatedAt: ts,
    };
    db()
      .prepare(
        `INSERT INTO github_sources (id, owner, repo, branch, label, selections_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(source.id, source.owner, source.repo, source.branch, source.label, JSON.stringify(source.selections), ts, ts);
    return source;
  },

  update(id: string, patch: { branch?: string; label?: string; selections?: GithubSelection[] }): GithubSource | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const next: GithubSource = {
      ...existing,
      branch: patch.branch ?? existing.branch,
      label: patch.label ?? existing.label,
      selections: patch.selections ?? existing.selections,
      updatedAt: now(),
    };
    db()
      .prepare("UPDATE github_sources SET branch = ?, label = ?, selections_json = ?, updated_at = ? WHERE id = ?")
      .run(next.branch, next.label, JSON.stringify(next.selections), next.updatedAt, id);
    return next;
  },

  // System updates that intentionally leave updated_at alone.
  recordSync(id: string, sha: string): void {
    db().prepare("UPDATE github_sources SET last_synced_sha = ?, last_synced_at = ?, last_error = NULL WHERE id = ?").run(sha, now(), id);
  },

  recordError(id: string, error: string): void {
    db().prepare("UPDATE github_sources SET last_error = ? WHERE id = ?").run(error, id);
  },

  remove(id: string): boolean {
    return db().prepare("DELETE FROM github_sources WHERE id = ?").run(id).changes > 0;
  },
};
