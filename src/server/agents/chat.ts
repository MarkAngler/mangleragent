import type Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { databricksBaseUrl, getDatabricksToken } from "../databricks";
import { getAnthropic } from "./anthropic";

// Provider seam for the Mangler agent. The agent loop and DB persistence are
// Anthropic-shaped; for the OpenAI-compatible Databricks gateway we translate
// in and out, so the rest of the system never sees the difference.

const MAX_TOKENS = 4096;

export type Provider = "anthropic" | "databricks";

export interface ChatResult {
  content: Anthropic.ContentBlockParam[];
  /** "tool_use" when the model wants to call tools; anything else ends the loop. */
  stopReason: string;
}

interface ChatParams {
  provider: Provider;
  model: string;
  system: string;
  tools: Anthropic.Tool[];
  messages: Anthropic.MessageParam[];
  onText: (text: string) => void;
}

export async function streamChat(p: ChatParams): Promise<ChatResult> {
  return p.provider === "databricks" ? streamDatabricks(p) : streamAnthropic(p);
}

async function streamAnthropic({ model, system, tools, messages, onText }: ChatParams): Promise<ChatResult> {
  const stream = getAnthropic().messages.stream({ model, max_tokens: MAX_TOKENS, system, tools, messages });
  stream.on("text", onText);
  const final = await stream.finalMessage();
  return { content: final.content, stopReason: final.stop_reason ?? "end" };
}

async function streamDatabricks({ model, system, tools, messages, onText }: ChatParams): Promise<ChatResult> {
  const client = new OpenAI({ baseURL: databricksBaseUrl(), apiKey: await getDatabricksToken() });
  const stream = client.chat.completions.stream({
    model,
    max_tokens: MAX_TOKENS,
    tools: toOpenAITools(tools),
    messages: toOpenAIMessages(system, messages),
  });
  stream.on("content", (delta) => onText(delta));
  const final = await stream.finalChatCompletion();
  return fromOpenAIChoice(final.choices[0]);
}

export function toOpenAITools(tools: Anthropic.Tool[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema as Record<string, unknown>,
    },
  }));
}

export function toOpenAIMessages(system: string, messages: Anthropic.MessageParam[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: "system", content: system }];

  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }

    if (m.role === "assistant") {
      let text = "";
      const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
      for (const block of m.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") {
          toolCalls.push({ id: block.id, type: "function", function: { name: block.name, arguments: JSON.stringify(block.input) } });
        }
      }
      const msg: OpenAI.Chat.Completions.ChatCompletionAssistantMessageParam = { role: "assistant" };
      if (text) msg.content = text;
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
      continue;
    }

    // user message: tool results become standalone tool messages; any text follows
    const texts: string[] = [];
    for (const block of m.content) {
      if (block.type === "tool_result") {
        out.push({ role: "tool", tool_call_id: block.tool_use_id, content: toolResultText(block.content) });
      } else if (block.type === "text") {
        texts.push(block.text);
      }
    }
    if (texts.length) out.push({ role: "user", content: texts.join("\n") });
  }

  return out;
}

function toolResultText(content: Anthropic.ToolResultBlockParam["content"]): string {
  if (typeof content === "string") return content;
  if (!content) return "";
  return content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
}

export function fromOpenAIChoice(choice: OpenAI.Chat.Completions.ChatCompletion.Choice): ChatResult {
  const blocks: Anthropic.ContentBlockParam[] = [];
  if (choice.message.content) blocks.push({ type: "text", text: choice.message.content });
  for (const call of choice.message.tool_calls ?? []) {
    if (call.type !== "function") continue;
    blocks.push({ type: "tool_use", id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments || "{}") });
  }
  return { content: blocks, stopReason: choice.finish_reason === "tool_calls" ? "tool_use" : choice.finish_reason };
}
