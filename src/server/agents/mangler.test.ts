import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-mangler-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb } = await import("../db/index");
const { configRepo } = await import("../db/config");
const { manglerSystemPrompt, DEFAULT_MANGLER_SYSTEM } = await import("./mangler");

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
