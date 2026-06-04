import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir (where the temp diff index lives) before importing the module.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ma-git-data-"));
process.env.MANGLED_DATA_DIR = dataDir;

const { isGitRepo, snapshotTree, runDiff, listBranches, switchBranch, commit: gitCommit, push: gitPush, gitStatus } = await import("./git");

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
}

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "ma-git-repo-"));
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "commit.gpgsign", "false");
  return repo;
}

const write = (repo: string, rel: string, content: string | Buffer) => fs.writeFileSync(path.join(repo, rel), content);

describe("runDiff", () => {
  it("reports modified, added, and ignored files without touching the real index", () => {
    const repo = makeRepo();
    write(repo, "tracked.txt", "line1\nline2\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "init");

    write(repo, "tracked.txt", "line1\nCHANGED\n");
    write(repo, "new.txt", "fresh\n");
    write(repo, ".gitignore", "ignored.log\n");
    write(repo, "ignored.log", "secret\n");

    const diff = runDiff(repo);
    expect(diff.available).toBe(true);
    expect(diff.truncated).toBe(false);

    const tracked = diff.files.find((f) => f.path === "tracked.txt");
    expect(tracked?.status).toBe("modified");
    expect(tracked?.additions).toBe(1);
    expect(tracked?.deletions).toBe(1);
    expect(tracked?.patch).toContain("+CHANGED");
    expect(tracked?.patch).toContain("-line2");
    expect(tracked?.patch.startsWith("diff --git a/tracked.txt b/tracked.txt")).toBe(true);

    const added = diff.files.find((f) => f.path === "new.txt");
    expect(added?.status).toBe("added");
    expect(added?.additions).toBe(1);
    expect(added?.deletions).toBe(0);

    expect(diff.files.find((f) => f.path === ".gitignore")?.status).toBe("added");
    expect(diff.files.find((f) => f.path === "ignored.log")).toBeUndefined();

    // The real index must be clean: every status line is unstaged (' ') or untracked ('?').
    const lines = git(repo, "status", "--porcelain").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l[0] === " " || l[0] === "?")).toBe(true);
  });

  it("snapshots a repo with no commits, reporting new files as added", () => {
    const repo = makeRepo();
    write(repo, "first.txt", "hello\n");

    expect(snapshotTree(repo)).toMatch(/^[0-9a-f]{40}$/);
    const diff = runDiff(repo);
    expect(diff.available).toBe(true);
    expect(diff.files.find((f) => f.path === "first.txt")?.status).toBe("added");
  });

  it("flags binary files with no line counts or patch", () => {
    const repo = makeRepo();
    write(repo, "keep.txt", "x\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "init");
    write(repo, "blob.bin", Buffer.from([0, 1, 2, 0, 3, 255, 0]));

    const bin = runDiff(repo).files.find((f) => f.path === "blob.bin");
    expect(bin?.binary).toBe(true);
    expect(bin?.patch).toBe("");
    expect(bin?.additions).toBe(0);
    expect(bin?.deletions).toBe(0);
  });

  it("returns unavailable for non-git and missing directories", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "ma-plain-"));
    expect(isGitRepo(plain)).toBe(false);
    expect(snapshotTree(plain)).toBeNull();
    expect(runDiff(plain).available).toBe(false);
    expect(runDiff(path.join(os.tmpdir(), "ma-nope-does-not-exist")).available).toBe(false);
  });

  it("reports a clean working tree as available with no files", () => {
    const repo = makeRepo();
    write(repo, "tracked.txt", "stable\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "init");

    const diff = runDiff(repo);
    expect(diff.available).toBe(true);
    expect(diff.files).toEqual([]);
  });
});

function commit(repo: string, rel: string, content: string): void {
  write(repo, rel, content);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", `add ${rel}`);
}

describe("listBranches / switchBranch", () => {
  it("lists the lone branch and reports it as current after a commit", () => {
    const repo = makeRepo();
    commit(repo, "a.txt", "a\n");
    const head = git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim();

    const result = listBranches(repo);
    expect(result.available).toBe(true);
    expect(result.current).toBe(head);
    expect(result.branches).toEqual([head]);
  });

  it("creates and checks out a new branch, then switches back", () => {
    const repo = makeRepo();
    commit(repo, "a.txt", "a\n");
    const base = git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim();

    const created = switchBranch(repo, "feature", true);
    expect(created.current).toBe("feature");
    expect(created.branches).toEqual(expect.arrayContaining([base, "feature"]));
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("feature");

    const back = switchBranch(repo, base, false);
    expect(back.current).toBe(base);
    expect(git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe(base);
  });

  it("reports current as null for an unborn repo with no commits", () => {
    const repo = makeRepo();
    const result = listBranches(repo);
    expect(result.available).toBe(true);
    expect(result.current).toBeNull();
    expect(result.branches).toEqual([]);
  });

  it("returns unavailable for non-git and missing directories", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "ma-plain-branches-"));
    expect(listBranches(plain).available).toBe(false);
    expect(listBranches(path.join(os.tmpdir(), "ma-nope-does-not-exist")).available).toBe(false);
  });

  it("throws when creating a branch that already exists", () => {
    const repo = makeRepo();
    commit(repo, "a.txt", "a\n");
    switchBranch(repo, "dup", true);
    const base = listBranches(repo).branches.find((b) => b !== "dup")!;
    switchBranch(repo, base, false);

    expect(() => switchBranch(repo, "dup", true)).toThrow();
  });
});

function makeBareRemote(): string {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), "ma-git-remote-"));
  git(remote, "init", "--bare", "-q");
  return remote;
}

describe("commit", () => {
  it("stages all changes and commits, returning the new short hash", () => {
    const repo = makeRepo();
    write(repo, "a.txt", "a\n");
    write(repo, "b.txt", "b\n");

    const hash = gitCommit(repo, "feat: add a and b");
    expect(hash).toMatch(/^[0-9a-f]{7,}$/);
    expect(git(repo, "rev-parse", "--short", "HEAD").trim()).toBe(hash);
    expect(git(repo, "log", "-1", "--pretty=%s").trim()).toBe("feat: add a and b");
    expect(git(repo, "status", "--porcelain").trim()).toBe("");
  });

  it("throws when there is nothing to commit", () => {
    const repo = makeRepo();
    commit(repo, "a.txt", "a\n");
    expect(() => gitCommit(repo, "noop")).toThrow();
  });
});

describe("gitStatus", () => {
  it("reports the branch with no upstream for a fresh local repo", () => {
    const repo = makeRepo();
    commit(repo, "a.txt", "a\n");
    const branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim();

    expect(gitStatus(repo)).toEqual({ available: true, branch, ahead: 0, hasUpstream: false });
  });

  it("tracks the ahead count once an upstream is set", () => {
    const repo = makeRepo();
    commit(repo, "a.txt", "a\n");
    git(repo, "remote", "add", "origin", makeBareRemote());
    gitPush(repo);

    expect(gitStatus(repo)).toMatchObject({ available: true, hasUpstream: true, ahead: 0 });

    commit(repo, "b.txt", "b\n");
    expect(gitStatus(repo).ahead).toBe(1);
  });

  it("returns unavailable for non-git directories", () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "ma-plain-status-"));
    expect(gitStatus(plain)).toEqual({ available: false, branch: null, ahead: 0, hasUpstream: false });
  });
});

describe("push", () => {
  it("sets the upstream on first push and lands the commit on the remote", () => {
    const repo = makeRepo();
    commit(repo, "a.txt", "a\n");
    const branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim();
    const remote = makeBareRemote();
    git(repo, "remote", "add", "origin", remote);

    expect(gitPush(repo)).toBe(`origin/${branch}`);
    expect(git(remote, "rev-parse", branch).trim()).toBe(git(repo, "rev-parse", "HEAD").trim());
    expect(gitStatus(repo)).toMatchObject({ hasUpstream: true, ahead: 0 });
  });

  it("is a no-op when the branch is already up to date", () => {
    const repo = makeRepo();
    commit(repo, "a.txt", "a\n");
    const branch = git(repo, "rev-parse", "--abbrev-ref", "HEAD").trim();
    git(repo, "remote", "add", "origin", makeBareRemote());
    gitPush(repo);

    expect(gitPush(repo)).toBe(`origin/${branch}`);
    expect(gitStatus(repo).ahead).toBe(0);
  });
});
