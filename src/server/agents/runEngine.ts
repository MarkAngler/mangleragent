import type { Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { runsRepo } from "../db/runs";
import { eventsRepo } from "../db/events";
import { broadcast } from "../realtime/hub";

// Shared plumbing for SDK-backed runs (orchestrated coding runs and task-agent runs):
// the active-query registry, approval bookkeeping, SDK-message → event translation, and stop.

export interface Verdict {
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

export const activeQueries = new Map<string, Query>();
const pendingApprovals = new Map<string, { runId: string; resolve: (v: Verdict) => void }>();

export function emit(runId: string, type: string, payload: unknown): void {
  const event = eventsRepo.add(runId, type, payload);
  broadcast({ type: "run.event", runId, event });
}

// Register a human approval and resolve it when /api/permissions/:id/decide arrives.
export function awaitHumanDecision(requestId: string, runId: string): Promise<Verdict> {
  return new Promise<Verdict>((resolve) => pendingApprovals.set(requestId, { runId, resolve }));
}

export function decideApproval(requestId: string, approved: boolean, reason?: string): boolean {
  const entry = pendingApprovals.get(requestId);
  if (!entry) return false;
  pendingApprovals.delete(requestId);
  entry.resolve({ approved, reason });
  return true;
}

// Interrupt a run's SDK query (if any) and deny any approvals it is waiting on, then mark it stopped.
export function stopRun(runId: string): boolean {
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

// Translate one SDK message into persisted run events / status. Returns true when the run is terminal.
export function handleMessage(runId: string, msg: SDKMessage): boolean {
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

export function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function truncate(s: string, max = 600): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
