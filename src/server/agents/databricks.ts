import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "../env";
import { anthropicTools } from "./manglerTools";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;
type ChatChunk = OpenAI.Chat.Completions.ChatCompletionChunk;

export interface ManglerCompletion {
  content: Anthropic.ContentBlockParam[];
  stopReason: "tool_use" | "end";
}

let client: OpenAI | null = null;

// The workspace host may be configured with or without a scheme; the OpenAI-compatible
// API lives under the /serving-endpoints path.
export function gatewayBaseUrl(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  return `${withScheme}/serving-endpoints`;
}

function getClient(): OpenAI {
  if (client) return client;
  if (!env.databricksHost || !env.databricksToken) throw new Error("Databricks not configured (set DATABRICKS_HOST and DATABRICKS_TOKEN).");
  client = new OpenAI({ baseURL: gatewayBaseUrl(env.databricksHost), apiKey: env.databricksToken });
  return client;
}

function toolResultText(content: Anthropic.ToolResultBlockParam["content"]): string {
  if (content == null) return "";
  return typeof content === "string" ? content : JSON.stringify(content);
}

// Translate the Anthropic-format history the Mangler loop keeps into the
// OpenAI chat-completions shape the gateway speaks.
export function toOpenAiMessages(system: string, messages: Anthropic.MessageParam[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push(m.role === "assistant" ? { role: "assistant", content: m.content } : { role: "user", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const toolCalls = m.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, type: "function" as const, function: { name: b.name, arguments: JSON.stringify(b.input) } }));
      out.push({ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    for (const b of m.content) {
      if (b.type === "tool_result") out.push({ role: "tool", tool_call_id: b.tool_use_id, content: toolResultText(b.content) });
    }
  }
  return out;
}

export function toOpenAiTools(): ChatTool[] {
  return anthropicTools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
  }));
}

// Fold an OpenAI streaming response back into Anthropic content blocks, emitting
// text deltas as they arrive. Tool-call argument fragments stream split across
// chunks, so they are accumulated by index before parsing.
export async function accumulateStream(stream: AsyncIterable<ChatChunk>, onText: (text: string) => void): Promise<ManglerCompletion> {
  let text = "";
  const toolCalls: { id: string; name: string; args: string }[] = [];

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;
    if (delta.content) {
      text += delta.content;
      onText(delta.content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const slot = (toolCalls[tc.index] ??= { id: "", name: "", args: "" });
      if (tc.id) slot.id = tc.id;
      if (tc.function?.name) slot.name = tc.function.name;
      if (tc.function?.arguments) slot.args += tc.function.arguments;
    }
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (text) content.push({ type: "text", text });
  for (const tc of toolCalls) content.push({ type: "tool_use", id: tc.id, name: tc.name, input: parseInput(tc.args) });
  return { content, stopReason: toolCalls.length ? "tool_use" : "end" };
}

function parseInput(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function streamDatabricks(args: {
  model: string;
  system: string;
  messages: Anthropic.MessageParam[];
  onText: (text: string) => void;
}): Promise<ManglerCompletion> {
  const stream = await getClient().chat.completions.create({
    model: args.model,
    max_tokens: 4096,
    messages: toOpenAiMessages(args.system, args.messages),
    tools: toOpenAiTools(),
    stream: true,
  });
  return accumulateStream(stream, args.onText);
}
