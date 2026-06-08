import { query, type CanUseTool, type Options } from "@anthropic-ai/claude-agent-sdk";
import { env } from "../env";
import { runsRepo } from "../db/runs";
import { agentsRepo } from "../db/agents";
import { conversationsRepo, messagesRepo } from "../db/chat";
import { permissionsRepo } from "../db/permissions";
import { broadcast } from "../realtime/hub";
import { activeQueries, awaitHumanDecision, emit, handleMessage, type Verdict } from "./runEngine";
import { DEFAULT_ORCH_MODEL } from "./orchestrator";
import { getAnthropic } from "./anthropic";
import { toSdkMcpServers } from "./mcp";
import { generateAndSetRunTitle } from "./runTitle";
import type { Agent, AgentRun } from "../../shared/types";

const MAX_TURNS = 40;

// Built-in tools a non-coding ("task") agent must never use: it works through its MCP servers
// and read-only tools, not by editing files or running shell commands.
const FILE_EDIT_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"];

// Default working directory for an agent run that isn't bound to a project. Created on boot
// (env.runsDir) and relocated with the data directory; task agents can't write to it anyway.
export function agentWorkspaceDir(): string {
  return env.runsDir;
}

// SDK options shared by an agent's runs and chats: a fully custom system prompt, only the agent's
// MCP servers, no filesystem settings, and (for task agents) file-editing/shell tools disabled.
function agentQueryBase(agent: Agent, cwd: string): Partial<Options> {
  const base: Partial<Options> = {
    cwd,
    model: agent.model ?? DEFAULT_ORCH_MODEL,
    systemPrompt: agent.systemPrompt.trim() || `You are ${agent.name}. ${agent.description}`.trim(),
    mcpServers: toSdkMcpServers(agent.mcpServerIds),
    settingSources: [],
    maxTurns: MAX_TURNS,
  };
  if (agent.type === "task") base.disallowedTools = FILE_EDIT_TOOLS;
  return base;
}

// Which tool calls require approval under the agent's policy: external (MCP) calls always, plus
// file-editing/shell tools for coding agents. "none" runs everything without gating.
function needsApproval(agent: Agent, toolName: string): boolean {
  if (agent.approval === "none") return false;
  return toolName.startsWith("mcp__") || FILE_EDIT_TOOLS.includes(toolName);
}

async function reviewToolCall(agent: Agent, toolName: string, input: unknown): Promise<Verdict> {
  try {
    const res = await getAnthropic().messages.create({
      model: DEFAULT_ORCH_MODEL,
      max_tokens: 300,
      system:
        "You are Mangler, supervising a specialized agent you delegated. Decide whether it may make this tool call. Reply with EXACTLY 'APPROVE' on its own line if the call is safe and on-task, or 'DENY: <reason>' if it should be blocked.",
      messages: [{ role: "user", content: `Agent: ${agent.name}\n${agent.description}\n\nTool: ${toolName}\nInput: ${JSON.stringify(input)}` }],
    });
    const text = res.content.find((b) => b.type === "text");
    const reply = (text && "text" in text ? text.text : "").trim();
    if (/^approve/i.test(reply)) return { approved: true, reason: "Approved by Mangler." };
    return { approved: false, reason: reply.replace(/^deny:\s*/i, "") || "Mangler blocked this call." };
  } catch (err) {
    // Don't deadlock the run if the review call fails; allow and note it.
    return { approved: true, reason: `auto-approved (review unavailable: ${(err as Error).message})` };
  }
}

async function gateToolCall(run: AgentRun, agent: Agent, toolName: string, input: unknown): Promise<Verdict> {
  const request = permissionsRepo.create({ runId: run.id, toolName, input, kind: "tool", approver: run.approver });
  runsRepo.setStatus(run.id, "awaiting_approval");
  broadcast({ type: "run.updated", runId: run.id });
  broadcast({ type: "permission.request", runId: run.id, request });

  const verdict = run.approver === "agent" ? await reviewToolCall(agent, toolName, input) : await awaitHumanDecision(request.id, run.id);

  permissionsRepo.resolve(request.id, verdict.approved ? "approved" : "denied", run.approver, verdict.reason);
  broadcast({ type: "permission.resolved", runId: run.id, requestId: request.id });
  runsRepo.setStatus(run.id, "running");
  broadcast({ type: "run.updated", runId: run.id });
  return verdict;
}

// Run a task/coding agent as a background run, streaming to clients via the shared run engine.
export async function startAgentRun(run: AgentRun, prompt: string, agent: Agent): Promise<void> {
  emit(run.id, "system", { text: `${agent.name} starting in ${run.cwd}` });
  runsRepo.setStatus(run.id, "running");
  broadcast({ type: "run.updated", runId: run.id });
  void generateAndSetRunTitle(run.id, prompt);

  const canUseTool: CanUseTool = async (toolName, input) => {
    if (!needsApproval(agent, toolName)) return { behavior: "allow" };
    const verdict = await gateToolCall(run, agent, toolName, input);
    return verdict.approved ? { behavior: "allow" } : { behavior: "deny", message: verdict.reason ?? "Blocked." };
  };

  let terminal = false;
  try {
    const q = query({ prompt, options: { ...agentQueryBase(agent, run.cwd), permissionMode: "default", canUseTool } });
    activeQueries.set(run.id, q);
    for await (const msg of q) {
      if (handleMessage(run.id, msg)) terminal = true;
    }
  } catch (err) {
    emit(run.id, "error", { text: (err as Error).message });
    runsRepo.setStatus(run.id, "failed");
    terminal = true;
  } finally {
    activeQueries.delete(run.id);
  }

  if (!terminal) {
    const current = runsRepo.get(run.id);
    if (current && !["done", "failed", "stopped"].includes(current.status)) runsRepo.setStatus(run.id, "done");
  }
  broadcast({ type: "run.updated", runId: run.id });
}

// Run one chat turn against a local agent: resume its SDK session, stream the reply, and persist it.
// The sibling of runExternalAgentTurn for in-app SDK agents. Tools run without gating (user-driven).
export async function runLocalAgentTurn(conversationId: string): Promise<void> {
  const conversation = conversationsRepo.get(conversationId);
  const agent = conversation?.localAgentId ? agentsRepo.get(conversation.localAgentId) : undefined;
  if (!agent) {
    broadcast({ type: "agent.error", conversationId, error: "agent not found for this conversation" });
    return;
  }

  const history = messagesRepo.list(conversationId);
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";
  const resume = conversationsRepo.getAgentSessionId(conversationId) ?? undefined;

  let reply = "";
  try {
    const q = query({ prompt, options: { ...agentQueryBase(agent, agentWorkspaceDir()), permissionMode: "default", resume } });
    for await (const msg of q) {
      if (msg.type === "system" && msg.subtype === "init" && msg.session_id) {
        conversationsRepo.setAgentSessionId(conversationId, msg.session_id);
      } else if (msg.type === "assistant") {
        const text = (msg.message.content as { type: string; text?: string }[])
          .filter((b) => b.type === "text" && b.text)
          .map((b) => b.text as string)
          .join("");
        if (text) {
          const chunk = reply ? `\n${text}` : text;
          reply += chunk;
          broadcast({ type: "agent.delta", conversationId, text: chunk });
        }
      }
    }
    messagesRepo.add(conversationId, "assistant", reply);
    broadcast({ type: "agent.done", conversationId });
  } catch (err) {
    broadcast({ type: "agent.error", conversationId, error: (err as Error).message });
  }
}
