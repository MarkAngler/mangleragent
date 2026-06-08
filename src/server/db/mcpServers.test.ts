import { describe, it, expect, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-mcp-db-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { initDb } = await import("./index");
const { mcpServersRepo } = await import("./mcpServers");

describe("mcpServersRepo", () => {
  beforeAll(() => {
    initDb();
  });

  it("round-trips a stdio server, preserving args/env JSON and defaulting enabled to true", () => {
    const server = mcpServersRepo.create({
      name: "filesystem",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: { API_TOKEN: "secret" },
    });
    expect(server.enabled).toBe(true);
    expect(server.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]);
    expect(server.env).toEqual({ API_TOKEN: "secret" });
    expect(mcpServersRepo.get(server.id)).toEqual(server);
  });

  it("stores a remote server with headers and an explicit disabled flag", () => {
    const server = mcpServersRepo.create({
      name: "remote",
      transport: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer xyz" },
      enabled: false,
    });
    expect(server.enabled).toBe(false);
    expect(server.url).toBe("https://example.com/mcp");
    expect(server.headers).toEqual({ Authorization: "Bearer xyz" });
    expect(mcpServersRepo.get(server.id)).toEqual(server);
  });

  it("listEnabled returns only enabled servers", () => {
    const enabled = mcpServersRepo.create({ name: "on", transport: "stdio", command: "node" });
    const disabled = mcpServersRepo.create({ name: "off", transport: "stdio", command: "node", enabled: false });
    const ids = mcpServersRepo.listEnabled().map((s) => s.id);
    expect(ids).toContain(enabled.id);
    expect(ids).not.toContain(disabled.id);
  });

  it("updates supplied fields including transport, leaving the rest, and returns undefined for an unknown id", () => {
    const server = mcpServersRepo.create({ name: "old", transport: "stdio", command: "node", args: ["a.js"] });
    const updated = mcpServersRepo.update(server.id, { transport: "sse", url: "https://x/sse" });
    expect(updated?.transport).toBe("sse");
    expect(updated?.url).toBe("https://x/sse");
    expect(updated?.command).toBe("node");
    expect(updated?.args).toEqual(["a.js"]);
    expect(mcpServersRepo.update("missing-id", { name: "x" })).toBeUndefined();
  });

  it("lists newest-first and removes", () => {
    const before = mcpServersRepo.list().length;
    const server = mcpServersRepo.create({ name: "temp", transport: "stdio", command: "node" });
    expect(mcpServersRepo.list()).toHaveLength(before + 1);
    expect(mcpServersRepo.list()[0].id).toBe(server.id);
    expect(mcpServersRepo.remove(server.id)).toBe(true);
    expect(mcpServersRepo.remove(server.id)).toBe(false);
  });
});
