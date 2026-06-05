import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-chat-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb } = await import("./index");
const { registeredAgentsRepo } = await import("./registeredAgents");
const { conversationsRepo } = await import("./chat");

describe("conversationsRepo agent scoping", () => {
  beforeAll(() => {
    initDb();
  });

  it("persists agentId on create and defaults it to null", () => {
    const mangler = conversationsRepo.create("Mangler chat");
    expect(mangler.agentId).toBeNull();

    const agent = registeredAgentsRepo.create({ name: "A", endpoint: "ep-a" });
    const bound = conversationsRepo.create("Agent chat", agent.id);
    expect(bound.agentId).toBe(agent.id);
    expect(conversationsRepo.get(bound.id)?.agentId).toBe(agent.id);
  });

  it("list() returns only Mangler conversations; listByAgent() returns only the agent's", () => {
    const agent = registeredAgentsRepo.create({ name: "B", endpoint: "ep-b" });
    const mangler = conversationsRepo.create("Mangler only");
    const bound = conversationsRepo.create("Bound only", agent.id);

    const manglerList = conversationsRepo.list();
    expect(manglerList.some((c) => c.id === mangler.id)).toBe(true);
    expect(manglerList.some((c) => c.id === bound.id)).toBe(false);

    const agentList = conversationsRepo.listByAgent(agent.id);
    expect(agentList.map((c) => c.id)).toEqual([bound.id]);
  });
});
