import { describe, it, expect, beforeAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { ServerMsg } from "../../shared/ws";

// Isolate the data dir and provide a key before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-mangler-stop-test-"));
process.env.MANGLED_DATA_DIR = tmp;
process.env.ANTHROPIC_API_KEY = "test-key";

// Capture broadcasts and stub the truly external services: the Anthropic client (whose
// stream parks until its abort signal fires), the WS hub, MCP, and honcho memory.
const hub = vi.hoisted(() => ({ broadcast: vi.fn() }));

vi.mock("../realtime/hub", () => ({ broadcast: hub.broadcast }));
vi.mock("./mcp", () => ({ loadMcpToolset: async () => ({ tools: [], has: () => false, call: async () => ({}) }) }));
vi.mock("../honcho", () => ({ recallUserMemory: async () => "", recordTurn: async () => {} }));
vi.mock("./anthropic", () => ({
  getAnthropic: () => ({
    messages: {
      stream: (_body: unknown, opts: { signal: AbortSignal }) => ({
        on(event: string, cb: (text: string) => void) {
          if (event === "text") cb("partial answer");
        },
        finalMessage(): Promise<never> {
          return new Promise((_, reject) => {
            if (opts.signal.aborted) reject(new Error("aborted"));
            else opts.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
          });
        },
      }),
    },
  }),
}));

const { initDb } = await import("../db/index");
const { conversationsRepo, messagesRepo } = await import("../db/chat");
const { runMangler, stopMangler } = await import("./mangler");

const tick = () => new Promise((r) => setTimeout(r, 2));

describe("stopMangler", () => {
  beforeAll(() => {
    initDb();
  });

  it("returns false when no turn is active for the conversation", () => {
    expect(stopMangler("does-not-exist")).toBe(false);
  });

  it("aborts the in-flight turn, persists the partial reply, and ends with mangler.done", async () => {
    const cid = conversationsRepo.create().id;
    messagesRepo.add(cid, "user", "hello");
    hub.broadcast.mockClear();

    const run = runMangler(cid);

    // Poll until the turn has registered its controller, then stop it.
    let stopped = false;
    for (let i = 0; i < 50 && !stopped; i++) {
      await tick();
      stopped = stopMangler(cid);
    }
    expect(stopped).toBe(true);
    await run;

    const sent = hub.broadcast.mock.calls.map((c) => c[0] as ServerMsg);
    expect(sent).toContainEqual({ type: "mangler.delta", conversationId: cid, text: "partial answer" });
    expect(sent.at(-1)).toEqual({ type: "mangler.done", conversationId: cid });
    expect(sent.some((m) => m.type === "mangler.error")).toBe(false);

    const messages = messagesRepo.list(cid);
    expect(messages.some((m) => m.role === "assistant" && JSON.stringify(m.content).includes("partial answer"))).toBe(true);

    // The registry is cleaned up once the turn settles.
    expect(stopMangler(cid)).toBe(false);
  });
});
