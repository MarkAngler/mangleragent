import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-agents-repo-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb } = await import("./index");
const { agentsRepo } = await import("./agents");
const { runsRepo } = await import("./runs");
const { schedulesRepo } = await import("./schedules");
const { conversationsRepo } = await import("./chat");

describe("agentsRepo", () => {
  beforeAll(() => {
    initDb();
  });

  it("creates a task agent with defaults and round-trips mcpServerIds", () => {
    const agent = agentsRepo.create({ name: "ServiceNow reviewer", mcpServerIds: ["srv-1", "srv-2"] });
    expect(agent.type).toBe("task");
    expect(agent.approval).toBe("none");
    expect(agent.model).toBeNull();
    expect(agent.mcpServerIds).toEqual(["srv-1", "srv-2"]);
    expect(agentsRepo.get(agent.id)).toEqual(agent);
  });

  it("updates supplied fields, clears the model with null, and leaves the rest", () => {
    const agent = agentsRepo.create({ name: "Old", model: "claude-sonnet-4-6", mcpServerIds: ["a"] });
    const updated = agentsRepo.update(agent.id, { name: "New", model: null });
    expect(updated?.name).toBe("New");
    expect(updated?.model).toBeNull();
    expect(updated?.mcpServerIds).toEqual(["a"]);
    expect(agentsRepo.update("missing-id", { name: "x" })).toBeUndefined();
  });

  it("lists newest-first and removes", () => {
    const before = agentsRepo.list().length;
    const agent = agentsRepo.create({ name: "Temp" });
    expect(agentsRepo.list()).toHaveLength(before + 1);
    expect(agentsRepo.list()[0].id).toBe(agent.id);
    expect(agentsRepo.remove(agent.id)).toBe(true);
    expect(agentsRepo.remove(agent.id)).toBe(false);
  });

  it("accepts the new 'agent' run kind and agentDef tag", () => {
    const agent = agentsRepo.create({ name: "Runner" });
    const run = runsRepo.create({ kind: "agent", title: agent.name, status: "running", cwd: tmp, agentDef: agent.id });
    expect(runsRepo.get(run.id)?.kind).toBe("agent");
    expect(runsRepo.get(run.id)?.agentDef).toBe(agent.id);
  });

  it("cascades to local-agent chats and nulls scheduled references on delete", () => {
    const agent = agentsRepo.create({ name: "Linked" });
    const conv = conversationsRepo.create("chat", null, agent.id);
    const schedule = schedulesRepo.create({ title: "daily", prompt: "go", cron: "0 9 * * *", agentId: agent.id, enabled: true, nextRunAt: null });
    expect(conversationsRepo.listByLocalAgent(agent.id)).toHaveLength(1);

    agentsRepo.remove(agent.id);
    expect(conversationsRepo.get(conv.id)).toBeUndefined();
    expect(schedulesRepo.get(schedule.id)?.agentId).toBeNull();
  });
});
