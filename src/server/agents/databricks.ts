import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { env } from "../env";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ChatTool = OpenAI.Chat.Completions.ChatCompletionTool;
type ChatChunk = OpenAI.Chat.Completions.ChatCompletionChunk;

export interface ManglerCompletion {
  content: Anthropic.ContentBlockParam[];
  stopReason: "tool_use" | "end";
}

let client: OpenAI | null = null;

// The workspace host may be configured with or without a scheme; normalize to a
// scheme-qualified origin with no trailing slash (e.g. https://dbc-xxx.cloud.databricks.com).
export function workspaceBaseUrl(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, "");
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// The OpenAI-compatible Model Serving API lives under the /serving-endpoints path.
export function gatewayBaseUrl(host: string): string {
  return `${workspaceBaseUrl(host)}/serving-endpoints`;
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

export function toOpenAiTools(tools: Anthropic.Tool[]): ChatTool[] {
  return tools.map((t) => ({
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
  tools: Anthropic.Tool[];
  onText: (text: string) => void;
}): Promise<ManglerCompletion> {
  const stream = await getClient().chat.completions.create({
    model: args.model,
    max_tokens: 4096,
    messages: toOpenAiMessages(args.system, args.messages),
    tools: toOpenAiTools(args.tools),
    stream: true,
  });
  return accumulateStream(stream, args.onText);
}

// Query a registered Databricks agent (a deployed ResponsesAgent endpoint) with a
// chat history. Agent endpoints speak the Agent Framework "responses" format — POST
// { input } to /invocations — not OpenAI chat-completions. Passing conversationId
// gives the endpoint per-conversation memory; omit it for one-shot, stateless calls.
export async function invokeDatabricksAgent(args: {
  endpoint: string;
  messages: { role: "user" | "assistant"; content: string }[];
  conversationId?: string;
  onText?: (text: string) => void;
}): Promise<string> {
  if (!env.databricksHost || !env.databricksToken) throw new Error("Databricks not configured (set DATABRICKS_HOST and DATABRICKS_TOKEN).");
  const url = `${gatewayBaseUrl(env.databricksHost)}/${args.endpoint}/invocations`;
  const memory = args.conversationId
    ? { databricks_options: { conversation_id: args.conversationId }, context: { conversation_id: args.conversationId } }
    : {};
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.databricksToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: args.messages, stream: true, ...memory }),
  });
  if (!res.ok || !res.body) throw new Error(`Databricks endpoint ${args.endpoint} returned ${res.status}: ${await res.text().catch(() => "")}`);
  return streamResponsesText(res.body, args.onText ?? (() => {}));
}

interface ResponsesStreamEvent {
  type?: string;
  delta?: string;
  item?: { content?: { type?: string; text?: string }[] };
}

// Consume a ResponsesAgent SSE stream, emitting text deltas via onText and returning
// the full reply. Falls back to completed output items for agents that stream only
// "response.output_item.done" events without per-token deltas.
export async function streamResponsesText(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamed = "";
  let fallback = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = parseSseData(block);
      if (!event) continue;
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        streamed += event.delta;
        onText(event.delta);
      } else if (event.type === "response.output_item.done") {
        fallback += extractItemText(event.item);
      }
    }
  }
  if (streamed) return streamed;
  if (fallback) onText(fallback);
  return fallback;
}

function parseSseData(block: string): ResponsesStreamEvent | null {
  const payload = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("");
  if (!payload || payload === "[DONE]") return null;
  try {
    return JSON.parse(payload) as ResponsesStreamEvent;
  } catch {
    return null;
  }
}

function extractItemText(item: ResponsesStreamEvent["item"]): string {
  return (item?.content ?? [])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("");
}

// A plain, tool-free completion for short auxiliary calls (e.g. titling a run).
export async function completeDatabricks(args: { model: string; system: string; user: string; maxTokens: number }): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: args.model,
    max_tokens: args.maxTokens,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });
  return res.choices[0]?.message?.content ?? "";
}
