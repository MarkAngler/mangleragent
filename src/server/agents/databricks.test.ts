import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-databricks-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { toOpenAiMessages, toOpenAiTools, accumulateStream, gatewayBaseUrl, workspaceBaseUrl, streamResponsesText } = await import("./databricks");

type ChatChunk = OpenAI.Chat.Completions.ChatCompletionChunk;

function chunk(delta: ChatChunk["choices"][number]["delta"]): ChatChunk {
  return { choices: [{ index: 0, delta, finish_reason: null }] } as unknown as ChatChunk;
}

describe("workspaceBaseUrl", () => {
  it("adds https when the host has no scheme", () => {
    expect(workspaceBaseUrl("dbc-e139bf31-ef34.cloud.databricks.com")).toBe("https://dbc-e139bf31-ef34.cloud.databricks.com");
  });

  it("preserves an explicit scheme and strips trailing slashes", () => {
    expect(workspaceBaseUrl("https://example.cloud.databricks.com/")).toBe("https://example.cloud.databricks.com");
  });
});

describe("gatewayBaseUrl", () => {
  it("adds https when the host has no scheme and appends the gateway path", () => {
    expect(gatewayBaseUrl("dbc-e139bf31-ef34.cloud.databricks.com")).toBe("https://dbc-e139bf31-ef34.cloud.databricks.com/serving-endpoints");
  });

  it("preserves an explicit scheme and strips trailing slashes", () => {
    expect(gatewayBaseUrl("https://example.cloud.databricks.com/")).toBe("https://example.cloud.databricks.com/serving-endpoints");
  });
});

describe("toOpenAiMessages", () => {
  it("translates system, user strings, assistant tool_use, and tool_result blocks", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "on it" },
          { type: "tool_use", id: "call_1", name: "list_projects", input: { archived: false } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "[]" }] },
    ];

    expect(toOpenAiMessages("SYS", messages)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "on it",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "list_projects", arguments: JSON.stringify({ archived: false }) } }],
      },
      { role: "tool", tool_call_id: "call_1", content: "[]" },
    ]);
  });

  it("omits tool_calls and sends null content for an assistant turn with no text or tools", () => {
    const messages: Anthropic.MessageParam[] = [{ role: "assistant", content: [] }];
    expect(toOpenAiMessages("SYS", messages)).toEqual([
      { role: "system", content: "SYS" },
      { role: "assistant", content: null },
    ]);
  });
});

describe("toOpenAiTools", () => {
  it("exposes the Mangler tools as OpenAI function tools", () => {
    const tools = toOpenAiTools();
    const names = tools.flatMap((t) => (t.type === "function" ? [t.function.name] : []));
    expect(names).toContain("list_projects");
    expect(names.length).toBe(tools.length);
    const listProjects = tools.find((t) => t.type === "function" && t.function.name === "list_projects");
    expect(listProjects?.type).toBe("function");
    expect(listProjects && listProjects.type === "function" && listProjects.function.parameters).toMatchObject({ type: "object" });
  });
});

describe("accumulateStream", () => {
  it("emits text deltas and folds split tool-call fragments into Anthropic content blocks", async () => {
    async function* stream() {
      yield chunk({ content: "Hello" });
      yield chunk({ content: " world" });
      yield chunk({ tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "create_ticket", arguments: '{"ti' } }] });
      yield chunk({ tool_calls: [{ index: 0, function: { arguments: 'tle":"x"}' } }] });
    }

    const seen: string[] = [];
    const result = await accumulateStream(stream(), (t) => seen.push(t));

    expect(seen).toEqual(["Hello", " world"]);
    expect(result.stopReason).toBe("tool_use");
    expect(result.content).toEqual([
      { type: "text", text: "Hello world" },
      { type: "tool_use", id: "call_a", name: "create_ticket", input: { title: "x" } },
    ]);
  });

  it("reports stopReason 'end' for a text-only response", async () => {
    async function* stream() {
      yield chunk({ content: "just text" });
    }
    const result = await accumulateStream(stream(), () => {});
    expect(result.stopReason).toBe("end");
    expect(result.content).toEqual([{ type: "text", text: "just text" }]);
  });
});

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

function deltaEvent(text: string): string {
  return `data: ${JSON.stringify({ type: "response.output_text.delta", delta: text })}\n\n`;
}

describe("streamResponsesText", () => {
  it("accumulates output_text deltas in order, emitting each via onText", async () => {
    const seen: string[] = [];
    // The middle event is split across read boundaries to exercise buffering.
    const reply = await streamResponsesText(
      sseStream([deltaEvent("Hello"), 'data: {"type":"response.output_text.delta","delta":"', ', world"}\n\n', deltaEvent("!")]),
      (t) => seen.push(t),
    );
    expect(reply).toBe("Hello, world!");
    expect(seen).toEqual(["Hello", ", world", "!"]);
  });

  it("falls back to completed output items when no deltas are streamed", async () => {
    const seen: string[] = [];
    const done = { type: "response.output_item.done", item: { content: [{ type: "output_text", text: "Final answer" }] } };
    const reply = await streamResponsesText(sseStream([`data: ${JSON.stringify(done)}\n\n`]), (t) => seen.push(t));
    expect(reply).toBe("Final answer");
    expect(seen).toEqual(["Final answer"]);
  });

  it("ignores [DONE] sentinels and malformed data lines", async () => {
    const seen: string[] = [];
    const reply = await streamResponsesText(sseStream([deltaEvent("ok"), "data: not-json\n\n", "data: [DONE]\n\n"]), (t) => seen.push(t));
    expect(reply).toBe("ok");
    expect(seen).toEqual(["ok"]);
  });
});
