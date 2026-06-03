import type { AgentRun, AgentRunStatus } from "../../shared/types";

export type AttentionSnapshot = Record<string, AgentRunStatus>;

const COMPLETION_STATUSES: AgentRunStatus[] = ["done", "failed"];
const TERMINAL_STATUSES: AgentRunStatus[] = ["done", "failed", "stopped"];

const isTerminal = (status: AgentRunStatus) => TERMINAL_STATUSES.includes(status);
const isCompletion = (status: AgentRunStatus): status is "done" | "failed" =>
  COMPLETION_STATUSES.includes(status);

/** Runs that currently need the user's input: orchestrated plan approvals and idle PTY prompts. */
export function needsInputRuns(runs: AgentRun[], ptyWaiting: ReadonlySet<string>): AgentRun[] {
  return runs.filter((run) =>
    run.status === "awaiting_approval" || (run.kind === "pty" && ptyWaiting.has(run.id)),
  );
}

/** Build a status snapshot keyed by run id, used as the baseline for transition detection. */
export function snapshotOf(runs: AgentRun[]): AttentionSnapshot {
  const snapshot: AttentionSnapshot = {};
  for (const run of runs) snapshot[run.id] = run.status;
  return snapshot;
}

/**
 * Completions newly entered since the previous snapshot. Fires only when a run was
 * known and non-terminal before and is now done/failed — so historical runs never
 * re-toast on first load or after a reconnect/refetch. `stopped` is user-initiated, so
 * it is excluded.
 */
export function diffCompletions(
  prev: AttentionSnapshot,
  runs: AgentRun[],
): { runId: string; status: "done" | "failed" }[] {
  const completions: { runId: string; status: "done" | "failed" }[] = [];
  for (const run of runs) {
    const before = prev[run.id];
    if (before !== undefined && !isTerminal(before) && isCompletion(run.status)) {
      completions.push({ runId: run.id, status: run.status });
    }
  }
  return completions;
}
