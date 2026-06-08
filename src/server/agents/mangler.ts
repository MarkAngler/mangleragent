import type Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { messagesRepo } from "../db/chat";
import { configRepo } from "../db/config";
import { broadcast } from "../realtime/hub";
import { recallUserMemory, recordTurn } from "../honcho";
import { listDefs, readDef, MANGLER_SCOPE } from "../defs";
import { agentsRepo } from "../db/agents";
import { getAnthropic } from "./anthropic";
import { streamDatabricks } from "./databricks";
import { anthropicTools, runTool } from "./manglerTools";
import { loadMcpToolset } from "./mcp";

const MEMORY_QUERY =
  "Summarize what you know about this user that helps you assist them: their projects, preferences, working style, and ongoing priorities. Be concise.";

function textOf(content: Anthropic.ContentBlockParam[]): string {
  return content
    .filter((b) => b.type === "text")
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
}

export const DEFAULT_MANGLER_MODEL = "claude-sonnet-4-6";

export const DEFAULT_MANGLER_SYSTEM = `You are Mangler, the primary organizing agent inside "Mangled Agents" — a workspace where a staff engineer manages projects and orchestrates Claude Code agents.

Your job: help the user stay organized and move work forward. You can read and modify their projects, kanban tickets, notes, and tasks through your tools.

Guidelines:
- Be concise and direct. Prefer doing over explaining.
- Resolve a project with list_projects before creating or moving its tickets — never guess an id.
- After taking an action, briefly confirm what changed.
- If a request is ambiguous, ask one focused question rather than guessing.`;

// Empty stored value = use the built-in default (the reset sentinel).
export function manglerSystemPrompt(): string {
  return configRepo.get("mangler_system_prompt") || DEFAULT_MANGLER_SYSTEM;
}

// Mangler's user-authored definitions (Definitions → Mangler scope): rules are
// injected in full as always-on guidance; skills are listed by name+description
// and pulled in full on demand via the load_skill tool. Recomputed each turn so
// edits take effect immediately. Returns "" when nothing is configured.
export function manglerDefinitionsPrompt(): string {
  let addon = "";
  const rules = listDefs(MANGLER_SCOPE, "rule");
  if (rules.length) {
    addon += "\n\n## Rules (always follow)";
    for (const rule of rules) {
      const file = readDef(MANGLER_SCOPE, "rule", rule.name);
      if (file) addon += `\n\n### ${rule.name}\n${file.content}`;
    }
  }
  const skills = listDefs(MANGLER_SCOPE, "skill");
  if (skills.length) {
    addon += "\n\n## Available skills\nCall the load_skill tool to load a skill's full instructions before using it.\n";
    for (const skill of skills) addon += `- ${skill.name}: ${skill.description}\n`;
  }
  return addon;
}

// The specialized agents the user has built. Listed so Mangler can route work to the right one:
// hand matching tasks to the best-fit agent via delegate_to_agent, and fall back to delegate_ticket
// for general coding. Recomputed each turn so newly built agents are available immediately.
export function manglerAgentsPrompt(): string {
  const agents = agentsRepo.list();
  if (!agents.length) return "";
  let addon =
    "\n\n## Specialized agents\nThe user has built these agents. When a request matches one, delegate to it with delegate_to_agent (a 'task' agent is non-coding and works through tools; a 'coding' agent edits files). Use delegate_ticket for general coding on a project.\n";
  for (const a of agents) addon += `- ${a.name} [${a.type}]: ${a.description}\n`;
  return addon;
}

const MAX_TURNS = 12;

function summarize(name: string, output: unknown): string | undefined {
  if (output && typeof output === "object" && "error" in output) return `error: ${String((output as { error: unknown }).error)}`;
  const out = output as Record<string, unknown>;
  switch (name) {
    case "create_ticket":
      return `created "${String(out.title ?? "")}"`;
    case "move_ticket":
      return `moved to ${String(out.columnId ?? "")}`;
    case "update_ticket":
      return `updated "${String(out.title ?? "")}"`;
    case "create_note":
      return `note "${String(out.title ?? "")}"`;
    case "create_task":
      return `task "${String(out.title ?? "")}"`;
    case "update_note":
    case "update_task":
      return `updated "${String(out.title ?? "")}"`;
    case "create_schedule":
      return `scheduled "${String(out.title ?? "")}"`;
    case "load_skill":
      return `loaded "${String(out.name ?? "")}"`;
    case "ask_external_agent":
      return "replied";
    case "delegate_to_agent":
      return out.agent ? `started ${String(out.agent)}` : undefined;
    case "run_command":
      return "denied" in out ? "denied" : `exit ${String(out.exitCode ?? "?")}`;
    default:
      return Array.isArray(output) ? `${output.length} items` : undefined;
  }
}

export async function runMangler(conversationId: string, modelOverride?: string): Promise<void> {
  const provider = configRepo.get("mangler_provider") ?? "anthropic";
  if (provider === "databricks") {
    if (!env.databricksHost || !env.databricksToken) {
      broadcast({ type: "mangler.error", conversationId, error: "Databricks not configured (set DATABRICKS_HOST and DATABRICKS_TOKEN)." });
      return;
    }
  } else if (!env.anthropicApiKey) {
    broadcast({ type: "mangler.error", conversationId, error: "No Claude API key configured (set CLAUDE_API_KEY)." });
    return;
  }
  const model = modelOverride ?? configRepo.get("mangler_model") ?? DEFAULT_MANGLER_MODEL;

  const history = messagesRepo.list(conversationId);
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content as Anthropic.MessageParam["content"],
  }));

  const lastUser = [...history].reverse().find((m) => m.role === "user" && typeof m.content === "string");
  const userText = typeof lastUser?.content === "string" ? lastUser.content : "";

  let system = manglerSystemPrompt() + manglerDefinitionsPrompt() + manglerAgentsPrompt();
  const memory = await recallUserMemory(MEMORY_QUERY);
  if (memory) system += `\n\n## Memory about the user (from honcho)\n${memory}`;

  let assistantText = "";

  // Merge the tools of every enabled MCP server into Mangler's built-in toolset. A
  // registered server that is unreachable contributes nothing rather than failing the turn.
  const mcp = await loadMcpToolset();
  const tools = [...anthropicTools, ...mcp.tools];

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const onText = (text: string) => broadcast({ type: "mangler.delta", conversationId, text });
      let content: Anthropic.ContentBlockParam[];
      let isToolUse: boolean;
      if (provider === "databricks") {
        const result = await streamDatabricks({ model, system, messages, tools, onText });
        content = result.content;
        isToolUse = result.stopReason === "tool_use";
      } else {
        const stream = getAnthropic().messages.stream({
          model,
          max_tokens: 4096,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
        });
        stream.on("text", onText);
        const final = await stream.finalMessage();
        content = final.content;
        isToolUse = final.stop_reason === "tool_use";
      }

      messagesRepo.add(conversationId, "assistant", content);
      messages.push({ role: "assistant", content });
      assistantText += textOf(content);

      if (!isToolUse) break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of content) {
        if (block.type !== "tool_use") continue;
        broadcast({ type: "mangler.tool", conversationId, tool: block.name, phase: "start" });
        const output = mcp.has(block.name)
          ? await mcp.call(block.name, block.input)
          : await runTool(block.name, block.input, { conversationId });
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
        broadcast({ type: "mangler.tool", conversationId, tool: block.name, phase: "done", summary: summarize(block.name, output) });
      }

      messagesRepo.add(conversationId, "user", results);
      messages.push({ role: "user", content: results });
    }
    broadcast({ type: "mangler.done", conversationId });
    void recordTurn(conversationId, userText, assistantText);
  } catch (err) {
    broadcast({ type: "mangler.error", conversationId, error: (err as Error).message });
  }
}
