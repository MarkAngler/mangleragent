import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import type { DiffFileStatus, FileDiff, GitBranches, GitStatus, RunDiff } from "../shared/types";

const IDX_DIR = path.join(env.dataDir, "diff-idx");
const GIT_TIMEOUT = 15_000;
// Pushing talks to a remote, which can outlast the default local-op timeout.
const PUSH_TIMEOUT = 60_000;
const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
// git's well-known empty tree object, used as the diff base for a repo with no commits.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

function git(cwd: string, args: string[], opts: { indexFile?: string; timeoutMs?: number } = {}): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    timeout: opts.timeoutMs ?? GIT_TIMEOUT,
    maxBuffer: MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
    env: opts.indexFile ? { ...process.env, GIT_INDEX_FILE: opts.indexFile } : process.env,
  });
}

export function isGitRepo(cwd: string): boolean {
  try {
    return git(cwd, ["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}

function headExists(cwd: string): boolean {
  try {
    git(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Snapshot the current working tree to a git tree object without touching the
 * user's real index. Seeds a throwaway index from HEAD (so tracked-but-ignored
 * files survive), then `add -A` to match the working tree (incl. untracked,
 * respecting .gitignore). Returns null if cwd is missing / not a repo / git fails.
 * The temp index lives outside the repo so `add -A` never sweeps it into the tree.
 */
export function snapshotTree(cwd: string): string | null {
  if (!fs.existsSync(cwd) || !isGitRepo(cwd)) return null;
  fs.mkdirSync(IDX_DIR, { recursive: true });
  const idx = path.join(IDX_DIR, `${randomUUID()}.idx`);
  try {
    try {
      git(cwd, ["read-tree", "HEAD"], { indexFile: idx });
    } catch {
      // Repo with no commits: there is no HEAD to seed from. add -A still works.
    }
    git(cwd, ["add", "-A"], { indexFile: idx });
    return git(cwd, ["write-tree"], { indexFile: idx }).trim();
  } catch {
    return null;
  } finally {
    fs.rmSync(idx, { force: true });
    fs.rmSync(`${idx}.lock`, { force: true });
  }
}

function stripPath(raw: string): string | null {
  if (raw === "/dev/null") return null;
  return raw.startsWith("a/") || raw.startsWith("b/") ? raw.slice(2) : raw;
}

function parseSection(sec: string[]): FileDiff | null {
  const header = /^diff --git a\/(.*) b\/(.*)$/.exec(sec[0]);
  const diffA = header?.[1] ?? null;
  const diffB = header?.[2] ?? null;

  let renameFrom: string | null = null;
  let renameTo: string | null = null;
  let minusPath: string | null = null;
  let plusPath: string | null = null;
  let isNew = false;
  let isDeleted = false;
  let isBinary = false;
  let additions = 0;
  let deletions = 0;
  let inHunk = false;

  for (let i = 1; i < sec.length; i++) {
    const line = sec[i];
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (inHunk) {
      if (line.startsWith("+")) additions++;
      else if (line.startsWith("-")) deletions++;
      continue;
    }
    if (line.startsWith("new file mode")) isNew = true;
    else if (line.startsWith("deleted file mode")) isDeleted = true;
    else if (line.startsWith("rename from ")) renameFrom = line.slice(12);
    else if (line.startsWith("rename to ")) renameTo = line.slice(10);
    else if (line.startsWith("--- ")) minusPath = stripPath(line.slice(4));
    else if (line.startsWith("+++ ")) plusPath = stripPath(line.slice(4));
    else if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) isBinary = true;
  }

  const filePath = plusPath ?? renameTo ?? diffB ?? minusPath ?? renameFrom ?? diffA;
  if (!filePath) return null;
  const status: DiffFileStatus = isNew
    ? "added"
    : isDeleted
      ? "deleted"
      : renameTo || renameFrom
        ? "renamed"
        : "modified";
  return {
    path: filePath,
    oldPath: status === "renamed" ? (renameFrom ?? minusPath ?? diffA) : null,
    status,
    additions: isBinary ? 0 : additions,
    deletions: isBinary ? 0 : deletions,
    binary: isBinary,
    patch: isBinary ? "" : sec.join("\n"),
  };
}

function parseUnifiedDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  let section: string[] | null = null;
  const flush = () => {
    if (!section) return;
    const file = parseSection(section);
    if (file) files.push(file);
    section = null;
  };
  for (const line of raw.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      section = [line];
    } else if (section) {
      section.push(line);
    }
  }
  flush();
  return files;
}

function diffTrees(cwd: string, base: string, now: string): { files: FileDiff[]; truncated: boolean } {
  let raw = git(cwd, ["-c", "core.quotePath=false", "diff", "--no-color", base, now]);
  let truncated = false;
  if (Buffer.byteLength(raw, "utf8") > MAX_PATCH_BYTES) {
    raw = raw.slice(0, MAX_PATCH_BYTES);
    truncated = true;
  }
  return { files: parseUnifiedDiff(raw), truncated };
}

/**
 * The uncommitted changes in `cwd` — tracked edits and new untracked files
 * (excluding .gitignore'd files) — diffed against the last commit. Read-only:
 * never mutates the repo or the user's index. Degrades to { available:false }
 * for non-git directories, missing paths, or any git failure.
 */
export function runDiff(cwd: string): RunDiff {
  const unavailable: RunDiff = { available: false, truncated: false, files: [] };
  try {
    const now = snapshotTree(cwd);
    if (!now) return unavailable;
    const base = headExists(cwd) ? "HEAD" : EMPTY_TREE;
    const { files, truncated } = diffTrees(cwd, base, now);
    return { available: true, truncated, files };
  } catch {
    return unavailable;
  }
}

/**
 * The local branches in `cwd` and the currently checked-out one. Read-only.
 * `current` is null for a detached HEAD or an unborn branch (repo with no
 * commits). Degrades to { available:false } for non-git/missing directories.
 */
export function listBranches(cwd: string): GitBranches {
  const unavailable: GitBranches = { available: false, current: null, branches: [] };
  if (!fs.existsSync(cwd) || !isGitRepo(cwd)) return unavailable;
  try {
    const branches = git(cwd, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    let current: string | null = null;
    try {
      const head = git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]).trim();
      current = head && branches.includes(head) ? head : null;
    } catch {
      current = null; // detached HEAD
    }
    return { available: true, current, branches };
  } catch {
    return unavailable;
  }
}

/**
 * Check out `branch`, creating it first when `create` is true. Throws on git
 * failure (e.g. a dirty tree blocking the switch, or a name that already
 * exists) so callers can surface git's stderr. Returns the post-switch state.
 */
export function switchBranch(cwd: string, branch: string, create: boolean): GitBranches {
  git(cwd, create ? ["checkout", "-b", branch] : ["checkout", branch]);
  return listBranches(cwd);
}

function upstreamRef(cwd: string): string | null {
  try {
    return git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).trim() || null;
  } catch {
    return null; // no upstream configured for the current branch
  }
}

/**
 * Stage every change (`add -A`) and commit it with `message`. Returns the new
 * commit's short hash. Throws on git failure (e.g. a clean tree's "nothing to
 * commit") so callers can surface git's stderr, matching `switchBranch`.
 */
export function commit(cwd: string, message: string): string {
  git(cwd, ["add", "-A"]);
  git(cwd, ["commit", "-m", message]);
  return git(cwd, ["rev-parse", "--short", "HEAD"]).trim();
}

/**
 * Push the current branch, setting its upstream on the first push when none is
 * configured (`push -u origin HEAD`). Returns the upstream it pushed to (e.g.
 * "origin/main") for user feedback — git writes its progress to stderr, which
 * `git()` discards. Throws on git failure so callers can surface the stderr.
 */
export function push(cwd: string): string {
  const args = upstreamRef(cwd) ? ["push"] : ["push", "-u", "origin", "HEAD"];
  git(cwd, args, { timeoutMs: PUSH_TIMEOUT });
  return upstreamRef(cwd) ?? "remote";
}

/**
 * The push-relevant state of `cwd`: current branch, whether its upstream is set,
 * and how many commits it is ahead of that upstream (0 when unset). Read-only.
 * Degrades to { available:false } for non-git/missing directories.
 */
export function gitStatus(cwd: string): GitStatus {
  const unavailable: GitStatus = { available: false, branch: null, ahead: 0, hasUpstream: false };
  if (!fs.existsSync(cwd) || !isGitRepo(cwd)) return unavailable;
  try {
    let branch: string | null = null;
    try {
      branch = git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]).trim() || null;
    } catch {
      branch = null; // detached HEAD
    }
    const upstream = upstreamRef(cwd);
    const ahead = upstream ? Number(git(cwd, ["rev-list", "--count", "@{u}..HEAD"]).trim()) || 0 : 0;
    return { available: true, branch, ahead, hasUpstream: Boolean(upstream) };
  } catch {
    return unavailable;
  }
}
