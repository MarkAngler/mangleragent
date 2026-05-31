import { query, type CanUseTool, type Query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { runsRepo } from "../db/runs";
import { ticketsRepo } from "../db/tickets";
import { eventsRepo } from "../db/events";
import { permissionsRepo } from "../db/permissions";
import { broadcast } from "../realtime/hub";
import { getAnthropic } from "./anthropic";
import type { AgentRun } from "../../shared/types";

export const DEFAULT_ORCH_MODEL = "claude-sonnet-4-6";
const MAX_TURNS = 60;

interface Verdict {
  approved: boolean;
  reason?: string;
}
interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
}

const activeQueries = new Map<string, Query>();
const pendingApprovals = new Map<string, { runId: string; resolve: (v: Verdict) => void }>();

function emit(runId: string, type: string, payload: unknown): void {
  const event = eventsRepo.add(runId, type, payload);
  broadcast({ type: "run.event", runId, event });
}

async function reviewPlan(run: AgentRun, plan: string): Promise<Verdict> {
  const ticket = run.ticketId ? ticketsRepo.get(run.ticketId) : undefined;
  const task = ticket ? `Ticket: ${ticket.title}\n${ticket.body}` : run.title;
  try {
    const res = await getAnthropic().messages.create({
      model: DEFAULT_ORCH_MODEL,
      max_tokens: 400,
      system:
        "You are Mangler, supervising a Claude Code agent you delegated. Review its implementation plan for the task. Reply with EXACTLY 'APPROVE' on its own line if the plan is sound, or 'REVISE: <specific, actionable feedback>' if it needs changes before execution.",
      messages: [{ role: "user", content: `Task:\n${task}\n\nProposed plan:\n${plan}` }],
    });
    const text = res.content.find((b) => b.type === "text");
    const reply = (text && "text" in text ? text.text : "").trim();
    if (/^approve/i.test(reply)) return { approved: true, reason: "Approved by Mangler." };
    return { approved: false, reason: reply.replace(/^revise:\s*/i, "") || "Mangler requested revisions." };
  } catch (err) {
    // Don't deadlock the run if the review call fails; allow and note it.
    return { approved: true, reason: `auto-approved (review unavailable: ${(err as Error).message})` };
  }
}

async function requestApproval(run: AgentRun, plan: string): Promise<Verdict> {
  const request = permissionsRepo.create({ runId: run.id, toolName: "ExitPlanMode", input: { plan }, kind: "plan", approver: run.approver });
  runsRepo.setStatus(run.id, "awaiting_approval");
  broadcast({ type: "run.updated", runId: run.id });
  broadcast({ type: "permission.request", runId: run.id, request });

  const verdict =
    run.approver === "agent"
      ? await reviewPlan(run, plan)
      : await new Promise<Verdict>((resolve) => pendingApprovals.set(request.id, { runId: run.id, resolve }));

  permissionsRepo.resolve(request.id, verdict.approved ? "approved" : "denied", run.approver, verdict.reason);
  broadcast({ type: "permission.resolved", runId: run.id, requestId: request.id });
  return verdict;
}

export function decideApproval(requestId: string, approved: boolean, reason?: string): boolean {
  const entry = pendingApprovals.get(requestId);
  if (!entry) return false;
  pendingApprovals.delete(requestId);
  entry.resolve({ approved, reason });
  return true;
}

export function stopOrchestratedRun(runId: string): boolean {
  const q = activeQueries.get(runId);
  for (const [reqId, entry] of pendingApprovals) {
    if (entry.runId === runId) {
      pendingApprovals.delete(reqId);
      entry.resolve({ approved: false, reason: "Run stopped." });
    }
  }
  if (q) void q.interrupt();
  runsRepo.setStatus(runId, "stopped");
  broadcast({ type: "run.updated", runId });
  return Boolean(q);
}

function handleMessage(runId: string, msg: SDKMessage): boolean {
  if (msg.type === "system") {
    if (msg.subtype === "init" && msg.session_id) runsRepo.setSessionId(runId, msg.session_id);
    return false;
  }
  if (msg.type === "assistant") {
    const blocks = (msg.message.content as ContentBlock[])
      .filter((b) => b.type === "text" || b.type === "tool_use")
      .map((b) => (b.type === "text" ? { type: "text", text: b.text } : { type: "tool_use", name: b.name, input: b.input }));
    if (blocks.length) emit(runId, "assistant", { blocks });
    return false;
  }
  if (msg.type === "user") {
    const content = msg.message.content;
    if (Array.isArray(content)) {
      const results = (content as ContentBlock[])
        .filter((b) => b.type === "tool_result")
        .map((b) => ({ content: truncate(stringify(b.content)) }));
      if (results.length) emit(runId, "tool_result", { results });
    }
    return false;
  }
  if (msg.type === "result") {
    const summary = msg.subtype === "success" ? msg.result : `ended: ${msg.subtype}`;
    emit(runId, "result", { subtype: msg.subtype, text: summary });
    runsRepo.setSummary(runId, String(summary).slice(0, 800));
    runsRepo.setStatus(runId, msg.subtype === "success" ? "done" : "failed");
    return true;
  }
  return false;
}

export async function startOrchestratedRun(run: AgentRun, prompt: string): Promise<void> {
  emit(run.id, "system", { text: `Delegated agent starting in ${run.cwd}` });
  runsRepo.setStatus(run.id, "planning");
  broadcast({ type: "run.updated", runId: run.id });

  let autoApproved = false;
  const canUseTool: CanUseTool = async (toolName, input) => {
    if (toolName === "ExitPlanMode") {
      const plan = typeof input.plan === "string" ? input.plan : JSON.stringify(input);
      const verdict = await requestApproval(run, plan);
      if (!verdict.approved) return { behavior: "deny", message: verdict.reason ?? "Plan rejected; please revise." };
      autoApproved = true;
      runsRepo.setStatus(run.id, "running");
      broadcast({ type: "run.updated", runId: run.id });
      const q = activeQueries.get(run.id);
      if (q) await q.setPermissionMode("acceptEdits").catch(() => undefined);
      return { behavior: "allow" };
    }
    if (autoApproved) return { behavior: "allow" };
    return { behavior: "allow" };
  };

  let terminal = false;
  try {
    const q = query({
      prompt,
      options: {
        cwd: run.cwd,
        model: run.model ?? DEFAULT_ORCH_MODEL,
        permissionMode: "plan",
        canUseTool,
        maxTurns: MAX_TURNS,
      },
    });
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

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function truncate(s: string, max = 600): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
