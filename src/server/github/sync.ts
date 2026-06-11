import fs from "node:fs";
import path from "node:path";
import { getFile, getHeadSha, listDir } from "./client";
import { saveDef, skillDir } from "../defs";
import { githubSourcesRepo } from "../db/githubSources";
import { broadcast } from "../realtime/hub";
import type { GithubSelection, GithubSource } from "../../shared/types";

export type SyncOutcome = { status: "synced" | "unchanged" } | { status: "error"; error: string };

// Definition name derived from the repo path: basename, .md stripped, sanitized
// to the same charset the create API enforces.
export function defNameFromPath(repoPath: string): string {
  return path.posix
    .basename(repoPath)
    .replace(/\.md$/i, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-");
}

async function collectSkillFiles(
  source: GithubSource,
  dirPath: string,
  baseDir: string,
): Promise<Array<{ relPath: string; content: Buffer }>> {
  const files: Array<{ relPath: string; content: Buffer }> = [];
  for (const entry of await listDir(source.owner, source.repo, dirPath, source.branch)) {
    // Guard against hostile API responses escaping the skill directory.
    if (entry.name.includes("..") || entry.name.includes("/")) continue;
    if (entry.type === "dir") {
      files.push(...(await collectSkillFiles(source, entry.path, baseDir)));
    } else {
      files.push({
        relPath: path.posix.relative(baseDir, entry.path),
        content: await getFile(source.owner, source.repo, entry.path, source.branch),
      });
    }
  }
  return files;
}

async function syncSelection(source: GithubSource, selection: GithubSelection): Promise<void> {
  const name = defNameFromPath(selection.path);
  if (selection.kind === "rule") {
    const content = (await getFile(source.owner, source.repo, selection.path, source.branch)).toString("utf8");
    for (const target of selection.targets) saveDef(target, "rule", name, content);
    return;
  }
  const files = await collectSkillFiles(source, selection.path, selection.path);
  for (const target of selection.targets) {
    // Clear-then-write (mirrors copyDef's skill overwrite) so removed assets don't linger.
    const dir = skillDir(target, name);
    fs.rmSync(dir, { recursive: true, force: true });
    for (const file of files) {
      const dest = path.join(dir, file.relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content);
    }
  }
}

// Additive/overwrite-only: de-selected or repo-removed definitions are never
// deleted locally — users remove them from the Definitions page.
export async function syncSource(source: GithubSource, opts: { force?: boolean } = {}): Promise<SyncOutcome> {
  try {
    const sha = await getHeadSha(source.owner, source.repo, source.branch);
    if (sha === source.lastSyncedSha && !opts.force) return { status: "unchanged" };
    for (const selection of source.selections) await syncSelection(source, selection);
    githubSourcesRepo.recordSync(source.id, sha);
    return { status: "synced" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    githubSourcesRepo.recordError(source.id, error);
    return { status: "error", error };
  }
}

// Sequential on purpose: a handful of sources at most, and GitHub rate-limits
// unauthenticated callers hard.
export async function syncAll(opts: { force?: boolean } = {}): Promise<void> {
  let synced = false;
  for (const source of githubSourcesRepo.list()) {
    const outcome = await syncSource(source, opts);
    if (outcome.status === "synced") synced = true;
  }
  broadcast({ type: "github.sources.updated" });
  if (synced) broadcast({ type: "defs.updated" });
}
