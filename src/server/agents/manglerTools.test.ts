import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-mangler-tools-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb } = await import("../db/index");
const { notesRepo } = await import("../db/notes");
const { tasksRepo } = await import("../db/tasks");
const { runTool } = await import("./manglerTools");

const ctx = { conversationId: "test" };

describe("update_note tool", () => {
  beforeAll(() => {
    initDb();
  });

  it("updates a note's title and body", async () => {
    const note = notesRepo.create({ title: "Original", body: "old" });
    const result = await runTool("update_note", { noteId: note.id, title: "Renamed", body: "new" }, ctx);
    expect(result).toMatchObject({ id: note.id, title: "Renamed", body: "new" });
    expect(notesRepo.get(note.id)).toMatchObject({ title: "Renamed", body: "new" });
  });

  it("returns an error for an unknown note id", async () => {
    expect(await runTool("update_note", { noteId: "missing", title: "x" }, ctx)).toEqual({ error: "note not found" });
  });
});

describe("update_task tool", () => {
  beforeAll(() => {
    initDb();
  });

  it("marks a task done", async () => {
    const task = tasksRepo.create({ title: "Do the thing" });
    expect(task.done).toBe(false);
    const result = await runTool("update_task", { taskId: task.id, done: true }, ctx);
    expect(result).toMatchObject({ id: task.id, done: true });
    expect(tasksRepo.get(task.id)?.done).toBe(true);
  });

  it("returns an error for an unknown task id", async () => {
    expect(await runTool("update_task", { taskId: "missing", done: true }, ctx)).toEqual({ error: "task not found" });
  });
});
