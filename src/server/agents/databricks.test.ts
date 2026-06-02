import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-databricks-test-"));
process.env.MANGLED_DATA_DIR = tmp;

const { toOpenAiMessages, toOpenAiTools, accumulateStream, gatewayBaseUrl } = await import("./databricks");

type ChatChunk = OpenAI.Chat.Completions.ChatCompletionChunk;

function chunk(delta: ChatChunk["choices"][number]["delta"]): ChatChunk {
  return { choices: [{ index: 0, delta, finish_reason: null }] } as unknown as ChatChunk;
}

describe("gatewayBaseUrl", () => {
  it("adds https when the host has no scheme and appends the gateway path", () => {
    expect(gatewayBaseUrl("dbc-e139bf31-ef34.cloud.databricks.com")).toBe("https://dbc-e139bf31-ef34.cloud.databricks.com/ai-gateway/mlflow/v1");
  });

  it("preserves an explicit scheme and strips trailing slashes", () => {
    expect(gatewayBaseUrl("https://example.cloud.databricks.com/")).toBe("https://example.cloud.databricks.com/ai-gateway/mlflow/v1");
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
