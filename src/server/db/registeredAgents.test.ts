import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-agents-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb } = await import("./index");
const { registeredAgentsRepo } = await import("./registeredAgents");
const { conversationsRepo, messagesRepo } = await import("./chat");

describe("registeredAgentsRepo", () => {
  beforeAll(() => {
    initDb();
  });

  it("creates an agent defaulting provider to databricks and storing fields", () => {
    const agent = registeredAgentsRepo.create({ name: "Triage", endpoint: "triage-endpoint", description: "support triage" });
    expect(agent.provider).toBe("databricks");
    expect(agent.name).toBe("Triage");
    expect(agent.endpoint).toBe("triage-endpoint");
    expect(registeredAgentsRepo.get(agent.id)).toEqual(agent);
  });

  it("updates supplied fields and leaves the rest, returning undefined for an unknown id", () => {
    const agent = registeredAgentsRepo.create({ name: "Old", endpoint: "ep-1" });
    const updated = registeredAgentsRepo.update(agent.id, { name: "New" });
    expect(updated?.name).toBe("New");
    expect(updated?.endpoint).toBe("ep-1");
    expect(registeredAgentsRepo.get(agent.id)?.name).toBe("New");
    expect(registeredAgentsRepo.update("missing-id", { name: "x" })).toBeUndefined();
  });

  it("lists newest-first and removes", () => {
    const before = registeredAgentsRepo.list().length;
    const agent = registeredAgentsRepo.create({ name: "Temp", endpoint: "ep-temp" });
    expect(registeredAgentsRepo.list()).toHaveLength(before + 1);
    expect(registeredAgentsRepo.list()[0].id).toBe(agent.id);
    expect(registeredAgentsRepo.remove(agent.id)).toBe(true);
    expect(registeredAgentsRepo.remove(agent.id)).toBe(false);
  });

  it("cascades to the agent's conversations and their messages on delete", () => {
    const agent = registeredAgentsRepo.create({ name: "Chatty", endpoint: "ep-chat" });
    const conv = conversationsRepo.create("Hi", agent.id);
    messagesRepo.add(conv.id, "user", "hello");
    expect(conversationsRepo.listByAgent(agent.id)).toHaveLength(1);

    registeredAgentsRepo.remove(agent.id);
    expect(conversationsRepo.listByAgent(agent.id)).toHaveLength(0);
    expect(conversationsRepo.get(conv.id)).toBeUndefined();
    expect(messagesRepo.list(conv.id)).toHaveLength(0);
  });
});
