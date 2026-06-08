import { describe, it, expect, beforeAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-mangler-tools-test-"));
process.env.MANGLED_DATA_DIR = tmp;

// delegate_to_agent kicks off a real SDK run; stub it so the tool only exercises run creation.
vi.mock("./agentRun", () => ({ startAgentRun: vi.fn(), agentWorkspaceDir: () => "/tmp/agent-workspace" }));

const { initDb } = await import("../db/index");
const { notesRepo } = await import("../db/notes");
const { tasksRepo } = await import("../db/tasks");
const { agentsRepo } = await import("../db/agents");
const { runsRepo } = await import("../db/runs");
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

describe("list_agents tool", () => {
  beforeAll(() => {
    initDb();
  });

  it("returns each agent's id, name, type and description", async () => {
    const agent = agentsRepo.create({ name: "ServiceNow reviewer", type: "task", description: "reviews tickets" });
    const result = (await runTool("list_agents", {}, ctx)) as { id: string; name: string; type: string; description: string }[];
    expect(result).toContainEqual({ id: agent.id, name: "ServiceNow reviewer", type: "task", description: "reviews tickets" });
  });
});

describe("delegate_to_agent tool", () => {
  beforeAll(() => {
    initDb();
  });

  it("starts an 'agent' run tagged with the agent id", async () => {
    const agent = agentsRepo.create({ name: "Reviewer", approval: "none" });
    const result = (await runTool("delegate_to_agent", { agentId: agent.id, task: "review today's tickets" }, ctx)) as {
      runId: string;
      status: string;
      agent: string;
    };
    expect(result.status).toBe("started");
    expect(result.agent).toBe("Reviewer");
    const run = runsRepo.get(result.runId);
    expect(run?.kind).toBe("agent");
    expect(run?.agentDef).toBe(agent.id);
  });

  it("returns an error for an unknown agent id", async () => {
    expect(await runTool("delegate_to_agent", { agentId: "missing", task: "x" }, ctx)).toEqual({ error: "agent not found" });
  });
});
