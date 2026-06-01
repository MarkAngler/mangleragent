import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { describe, it, expect } from "vitest";
import { toOpenAITools, toOpenAIMessages, fromOpenAIChoice } from "./chat";

describe("toOpenAITools", () => {
  it("maps Anthropic tools to OpenAI function tools", () => {
    const tools: Anthropic.Tool[] = [
      { name: "list_projects", description: "List projects", input_schema: { type: "object", properties: {} } },
    ];
    expect(toOpenAITools(tools)).toEqual([
      {
        type: "function",
        function: { name: "list_projects", description: "List projects", parameters: { type: "object", properties: {} } },
      },
    ]);
  });
});

describe("toOpenAIMessages", () => {
  it("prepends the system prompt and passes string content through", () => {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: "hello" }];
    expect(toOpenAIMessages("be helpful", messages)).toEqual([
      { role: "system", content: "be helpful" },
      { role: "user", content: "hello" },
    ]);
  });

  it("converts an assistant text+tool_use message into content + tool_calls", () => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Listing now." },
          { type: "tool_use", id: "tu_1", name: "list_projects", input: { limit: 5 } },
        ],
      },
    ];
    expect(toOpenAIMessages("sys", messages)[1]).toEqual({
      role: "assistant",
      content: "Listing now.",
      tool_calls: [{ id: "tu_1", type: "function", function: { name: "list_projects", arguments: JSON.stringify({ limit: 5 }) } }],
    });
  });

  it("turns a tool_result user message into a standalone tool message", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: '{"projects":[]}' }] },
    ];
    expect(toOpenAIMessages("sys", messages)[1]).toEqual({
      role: "tool",
      tool_call_id: "tu_1",
      content: '{"projects":[]}',
    });
  });
});

describe("fromOpenAIChoice", () => {
  it("maps a tool_calls choice to Anthropic tool_use blocks with parsed input", () => {
    const choice = {
      finish_reason: "tool_calls",
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "create_ticket", arguments: '{"title":"x"}' } }],
      },
    } as unknown as OpenAI.Chat.Completions.ChatCompletion.Choice;

    expect(fromOpenAIChoice(choice)).toEqual({
      content: [{ type: "tool_use", id: "call_1", name: "create_ticket", input: { title: "x" } }],
      stopReason: "tool_use",
    });
  });

  it("maps a text choice to an Anthropic text block and preserves the stop reason", () => {
    const choice = {
      finish_reason: "stop",
      message: { role: "assistant", content: "Done." },
    } as unknown as OpenAI.Chat.Completions.ChatCompletion.Choice;

    expect(fromOpenAIChoice(choice)).toEqual({
      content: [{ type: "text", text: "Done." }],
      stopReason: "stop",
    });
  });
});
