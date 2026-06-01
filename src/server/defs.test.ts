import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFrontmatter, copyDef, createDef, readDef, saveDef } from "./defs";
import { projectsRepo } from "./db/projects";

describe("parseFrontmatter", () => {
  it("extracts top-level keys and strips surrounding quotes", () => {
    const md = `---\nname: reviewer\ndescription: "Reviews code for bugs"\n---\n\nBody here.`;
    expect(parseFrontmatter(md)).toEqual({ name: "reviewer", description: "Reviews code for bugs" });
  });

  it("returns an empty object when there is no frontmatter", () => {
    expect(parseFrontmatter("# Just a heading\n\ntext")).toEqual({});
  });
});

describe("copyDef", () => {
  let fromId: string;
  let toId: string;
  const dirs: string[] = [];

  beforeAll(() => {
    const a = fs.mkdtempSync(path.join(os.tmpdir(), "defs-from-"));
    const b = fs.mkdtempSync(path.join(os.tmpdir(), "defs-to-"));
    dirs.push(a, b);
    fromId = projectsRepo.create({ path: a, name: "from" }).id;
    toId = projectsRepo.create({ path: b, name: "to" }).id;
  });

  afterAll(() => {
    projectsRepo.remove(fromId);
    projectsRepo.remove(toId);
    for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it("copies a rule into a new scope", () => {
    const src = createDef(fromId, "rule", "style");
    expect(copyDef(fromId, toId, "rule", "style", false)).toBe("copied");
    expect(readDef(toId, "rule", "style")?.content).toBe(src.content);
  });

  it("returns 'exists' when the target already has it and overwrite is false", () => {
    createDef(fromId, "agent", "dup");
    expect(copyDef(fromId, toId, "agent", "dup", false)).toBe("copied");
    expect(copyDef(fromId, toId, "agent", "dup", false)).toBe("exists");
  });

  it("overwrites the target when overwrite is true", () => {
    createDef(fromId, "agent", "ow");
    copyDef(fromId, toId, "agent", "ow", false);
    saveDef(fromId, "agent", "ow", "updated body");
    expect(copyDef(fromId, toId, "agent", "ow", true)).toBe("copied");
    expect(readDef(toId, "agent", "ow")?.content).toBe("updated body");
  });

  it("recursively copies a skill directory including auxiliary files", () => {
    createDef(fromId, "skill", "helper");
    fs.writeFileSync(path.join(dirs[0], ".claude", "skills", "helper", "extra.txt"), "aux");
    expect(copyDef(fromId, toId, "skill", "helper", false)).toBe("copied");
    const destDir = path.join(dirs[1], ".claude", "skills", "helper");
    expect(fs.readFileSync(path.join(destDir, "extra.txt"), "utf8")).toBe("aux");
    expect(fs.existsSync(path.join(destDir, "SKILL.md"))).toBe(true);
  });

  it("throws when the source definition does not exist", () => {
    expect(() => copyDef(fromId, toId, "rule", "missing", false)).toThrow("source definition not found");
  });
});
