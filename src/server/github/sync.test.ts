import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { syncAll, syncSource } from "./sync";
import { githubSourcesRepo } from "../db/githubSources";
import { projectsRepo } from "../db/projects";
import { getFile, getHeadSha, listDir } from "./client";
import type { GithubTreeEntry } from "../../shared/types";

vi.mock("./client", () => ({
  getHeadSha: vi.fn(),
  listDir: vi.fn(),
  getFile: vi.fn(),
}));
vi.mock("../realtime/hub", () => ({ broadcast: vi.fn() }));

const mockHeadSha = vi.mocked(getHeadSha);
const mockListDir = vi.mocked(listDir);
const mockGetFile = vi.mocked(getFile);

// A fake repo tree the mocked client serves: dir path -> entries, file path -> content.
let repoDirs: Record<string, GithubTreeEntry[]>;
let repoFiles: Record<string, string>;

function serveRepo(): void {
  mockListDir.mockImplementation((_o, _r, dirPath) => {
    const entries = repoDirs[dirPath];
    if (!entries) return Promise.reject(new Error("not a directory"));
    return Promise.resolve(entries);
  });
  mockGetFile.mockImplementation((_o, _r, filePath) => {
    const content = repoFiles[filePath];
    if (content === undefined) return Promise.reject(new Error(`no content for ${filePath}`));
    return Promise.resolve(Buffer.from(content));
  });
}

describe("syncSource", () => {
  let projectId: string;
  let projectDir: string;

  beforeAll(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-sync-"));
    projectId = projectsRepo.create({ path: projectDir, name: "sync-target" }).id;
  });

  afterAll(() => {
    projectsRepo.remove(projectId);
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    repoDirs = {};
    repoFiles = {};
    serveRepo();
  });

  it("writes a rule into every target scope and records the synced sha", () => {
    mockHeadSha.mockResolvedValue("sha-1");
    repoFiles["rules/style.md"] = "# Style rule";
    const source = githubSourcesRepo.create({
      owner: "o",
      repo: "r",
      branch: "main",
      selections: [{ kind: "rule", path: "rules/style.md", targets: [projectId] }],
    });
    return syncSource(source).then((outcome) => {
      expect(outcome).toEqual({ status: "synced" });
      expect(fs.readFileSync(path.join(projectDir, ".claude", "rules", "style.md"), "utf8")).toBe("# Style rule");
      expect(githubSourcesRepo.get(source.id)?.lastSyncedSha).toBe("sha-1");
      githubSourcesRepo.remove(source.id);
    });
  });

  it("writes a skill tree and clears stale assets on re-sync", async () => {
    mockHeadSha.mockResolvedValue("sha-1");
    repoDirs["skills/helper"] = [
      { name: "SKILL.md", path: "skills/helper/SKILL.md", type: "file" },
      { name: "docs", path: "skills/helper/docs", type: "dir" },
    ];
    repoDirs["skills/helper/docs"] = [{ name: "extra.md", path: "skills/helper/docs/extra.md", type: "file" }];
    repoFiles["skills/helper/SKILL.md"] = "# Helper";
    repoFiles["skills/helper/docs/extra.md"] = "aux";
    const source = githubSourcesRepo.create({
      owner: "o",
      repo: "r",
      branch: "main",
      selections: [{ kind: "skill", path: "skills/helper", targets: [projectId] }],
    });

    expect(await syncSource(source)).toEqual({ status: "synced" });
    const skillDir = path.join(projectDir, ".claude", "skills", "helper");
    expect(fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8")).toBe("# Helper");
    expect(fs.readFileSync(path.join(skillDir, "docs", "extra.md"), "utf8")).toBe("aux");

    mockHeadSha.mockResolvedValue("sha-2");
    repoDirs["skills/helper"] = [{ name: "SKILL.md", path: "skills/helper/SKILL.md", type: "file" }];
    expect(await syncSource(githubSourcesRepo.get(source.id)!)).toEqual({ status: "synced" });
    expect(fs.existsSync(path.join(skillDir, "docs"))).toBe(false);
    expect(fs.existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
    githubSourcesRepo.remove(source.id);
  });

  it("skips an unchanged source unless forced", async () => {
    mockHeadSha.mockResolvedValue("sha-1");
    repoFiles["rules/a.md"] = "a";
    const source = githubSourcesRepo.create({
      owner: "o",
      repo: "r",
      branch: "main",
      selections: [{ kind: "rule", path: "rules/a.md", targets: [projectId] }],
    });
    await syncSource(source);
    mockGetFile.mockClear();

    expect(await syncSource(githubSourcesRepo.get(source.id)!)).toEqual({ status: "unchanged" });
    expect(mockGetFile).not.toHaveBeenCalled();

    expect(await syncSource(githubSourcesRepo.get(source.id)!, { force: true })).toEqual({ status: "synced" });
    expect(mockGetFile).toHaveBeenCalled();
    githubSourcesRepo.remove(source.id);
  });

  it("records the error and keeps syncing other sources in syncAll", async () => {
    const failing = githubSourcesRepo.create({
      owner: "bad",
      repo: "r",
      branch: "main",
      selections: [{ kind: "rule", path: "rules/x.md", targets: [projectId] }],
    });
    const healthy = githubSourcesRepo.create({
      owner: "o",
      repo: "r",
      branch: "main",
      selections: [{ kind: "rule", path: "rules/ok.md", targets: [projectId] }],
    });
    mockHeadSha.mockImplementation((owner) => (owner === "bad" ? Promise.reject(new Error("GitHub 404: Not Found")) : Promise.resolve("sha-1")));
    repoFiles["rules/ok.md"] = "ok";

    await syncAll();
    expect(githubSourcesRepo.get(failing.id)?.lastError).toBe("GitHub 404: Not Found");
    expect(githubSourcesRepo.get(healthy.id)?.lastSyncedSha).toBe("sha-1");
    expect(fs.readFileSync(path.join(projectDir, ".claude", "rules", "ok.md"), "utf8")).toBe("ok");
    githubSourcesRepo.remove(failing.id);
    githubSourcesRepo.remove(healthy.id);
  });
});
