import type { AgentRun } from "../../shared/types";

export const NO_PROJECT_KEY = "__none__";

export interface RunColumn {
  projectId: string | null;
  runs: AgentRun[];
  effectiveRunId: string;
}

export const pinKey = (projectId: string | null) => projectId ?? NO_PROJECT_KEY;

/**
 * Groups newest-first runs into one column per project. Column order follows
 * each project's most-recent run; the effective run is the pinned run when it
 * still exists, otherwise the most recent.
 */
export function buildColumns(runs: AgentRun[], pinned: Record<string, string>): RunColumn[] {
  const groups = new Map<string, AgentRun[]>();
  for (const run of runs) {
    const key = pinKey(run.projectId);
    const bucket = groups.get(key);
    if (bucket) bucket.push(run);
    else groups.set(key, [run]);
  }

  return Array.from(groups.values()).map((groupRuns) => {
    const pinnedId = pinned[pinKey(groupRuns[0].projectId)];
    const effective = groupRuns.find((r) => r.id === pinnedId) ?? groupRuns[0];
    return { projectId: groupRuns[0].projectId, runs: groupRuns, effectiveRunId: effective.id };
  });
}
