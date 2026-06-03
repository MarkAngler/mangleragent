import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-mangler-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb } = await import("../db/index");
const { configRepo } = await import("../db/config");
const { createDef, saveDef } = await import("../defs");
const { manglerSystemPrompt, manglerDefinitionsPrompt, DEFAULT_MANGLER_SYSTEM } = await import("./mangler");
const { runTool } = await import("./manglerTools");

describe("manglerSystemPrompt", () => {
  beforeAll(() => {
    initDb();
  });

  it("returns the built-in default when no override is stored", () => {
    expect(manglerSystemPrompt()).toBe(DEFAULT_MANGLER_SYSTEM);
  });

  it("returns the stored override when one is set", () => {
    configRepo.set("mangler_system_prompt", "You are Custom Mangler. Reply only in haiku.");
    expect(manglerSystemPrompt()).toBe("You are Custom Mangler. Reply only in haiku.");
  });

  it("treats an empty stored value as the reset sentinel and falls back to the default", () => {
    configRepo.set("mangler_system_prompt", "");
    expect(manglerSystemPrompt()).toBe(DEFAULT_MANGLER_SYSTEM);
  });
});

const RULE_BODY = "# bullets\nAlways answer in bullet points. RULE_MARKER_XYZ\n";
const SKILL_CONTENT = "---\nname: triage\ndescription: Use when triaging incoming work.\n---\n\n# triage\nSKILL_BODY_MARKER\n";

describe("manglerDefinitionsPrompt", () => {
  // Runs before the nested suite's beforeAll populates the Mangler scope.
  it("returns an empty string when the Mangler scope has no definitions", () => {
    expect(manglerDefinitionsPrompt()).toBe("");
  });

  describe("with rules and skills", () => {
    beforeAll(() => {
      createDef("mangler", "rule", "bullets");
      saveDef("mangler", "rule", "bullets", RULE_BODY);
      createDef("mangler", "skill", "triage");
      saveDef("mangler", "skill", "triage", SKILL_CONTENT);
    });

    it("stores Mangler definitions under .claude-mangler", () => {
      expect(saveDef("mangler", "rule", "bullets", RULE_BODY).path).toContain(path.join(".claude-mangler", "rules"));
    });

    it("injects rule bodies in full as always-on guidance", () => {
      const prompt = manglerDefinitionsPrompt();
      expect(prompt).toContain("## Rules (always follow)");
      expect(prompt).toContain("### bullets");
      expect(prompt).toContain("RULE_MARKER_XYZ");
    });

    it("lists skills by name and description but withholds their body (progressive disclosure)", () => {
      const prompt = manglerDefinitionsPrompt();
      expect(prompt).toContain("## Available skills");
      expect(prompt).toContain("- triage: Use when triaging incoming work.");
      expect(prompt).not.toContain("SKILL_BODY_MARKER");
    });

    it("load_skill returns the full SKILL.md for a known skill", async () => {
      expect(await runTool("load_skill", { name: "triage" }, { conversationId: "test" })).toEqual({ name: "triage", content: SKILL_CONTENT });
    });

    it("load_skill returns an error for an unknown skill", async () => {
      expect(await runTool("load_skill", { name: "does-not-exist" }, { conversationId: "test" })).toEqual({ error: "no such skill" });
    });
  });
});
