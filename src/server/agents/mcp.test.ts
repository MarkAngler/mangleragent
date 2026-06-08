import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-mcp-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { sanitizeMcpName, mcpToolName } = await import("./mcp");
const { CreateMcpServerInput } = await import("../../shared/types");

describe("sanitizeMcpName", () => {
  it("replaces characters outside [a-zA-Z0-9_-] with underscores", () => {
    expect(sanitizeMcpName("My Server!")).toBe("My_Server_");
    expect(sanitizeMcpName("do.thing")).toBe("do_thing");
    expect(sanitizeMcpName("keep-_09")).toBe("keep-_09");
  });
});

describe("mcpToolName", () => {
  it("namespaces a server's tool so it never collides with built-in tool names", () => {
    expect(mcpToolName("filesystem", "read_file")).toBe("mcp__filesystem__read_file");
  });

  it("sanitizes both the server name and tool name", () => {
    expect(mcpToolName("My Server!", "do.thing")).toBe("mcp__My_Server___do_thing");
  });

  it("clamps to the 128-char Anthropic tool-name limit", () => {
    const name = mcpToolName("s".repeat(200), "t".repeat(200));
    expect(name.length).toBe(128);
    expect(name.startsWith("mcp__")).toBe(true);
  });
});

describe("CreateMcpServerInput", () => {
  it("requires a command for the stdio transport", () => {
    expect(CreateMcpServerInput.safeParse({ name: "fs", transport: "stdio" }).success).toBe(false);
    expect(CreateMcpServerInput.safeParse({ name: "fs", transport: "stdio", command: "npx" }).success).toBe(true);
  });

  it("requires a url for http and sse transports", () => {
    expect(CreateMcpServerInput.safeParse({ name: "remote", transport: "http" }).success).toBe(false);
    expect(CreateMcpServerInput.safeParse({ name: "remote", transport: "http", url: "https://x/mcp" }).success).toBe(true);
    expect(CreateMcpServerInput.safeParse({ name: "remote", transport: "sse", url: "https://x/sse" }).success).toBe(true);
  });

  it("rejects an empty name and an unknown transport", () => {
    expect(CreateMcpServerInput.safeParse({ name: "", transport: "stdio", command: "npx" }).success).toBe(false);
    expect(CreateMcpServerInput.safeParse({ name: "fs", transport: "carrier-pigeon" }).success).toBe(false);
  });
});
