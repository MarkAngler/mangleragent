import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-projects-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb } = await import("./index");
const { projectsRepo } = await import("./projects");

describe("projectsRepo", () => {
  beforeAll(() => {
    initDb();
  });

  it("creates a project with default columns and a name derived from the folder", () => {
    const project = projectsRepo.create({ path: "/tmp/acme/api-gateway" });
    expect(project.name).toBe("api-gateway");
    expect(project.columns.map((c) => c.id)).toEqual(["backlog", "todo", "in_progress", "review", "done"]);
    expect(project.settings).toEqual({});
  });

  it("honors an explicit name override", () => {
    const project = projectsRepo.create({ path: "/tmp/acme/web", name: "Web App" });
    expect(project.name).toBe("Web App");
  });

  it("lists, looks up by path, and removes", () => {
    const before = projectsRepo.list().length;
    const project = projectsRepo.create({ path: "/tmp/acme/worker" });
    expect(projectsRepo.list()).toHaveLength(before + 1);
    expect(projectsRepo.findByPath("/tmp/acme/worker")?.id).toBe(project.id);
    expect(projectsRepo.remove(project.id)).toBe(true);
    expect(projectsRepo.remove(project.id)).toBe(false);
    expect(projectsRepo.findByPath("/tmp/acme/worker")).toBeUndefined();
  });
});
