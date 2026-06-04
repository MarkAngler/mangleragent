import type { AgentRun } from "../../shared/types";

export const NO_PROJECT_KEY = "__none__";

export interface RunColumn {
  projectId: string | null;
  runs: AgentRun[];
  effectiveRunId: string;
}

export const pinKey = (projectId: string | null) => projectId ?? NO_PROJECT_KEY;

/**
 * Builds the columns for the agents view from newest-first runs.
 *
 * When the total run count is at most `maxVisible`, each run gets its own column
 * (expanded) so concurrent sessions — including several from the same project —
 * are visible side by side. Above that threshold, runs collapse to one column
 * per project; the effective run is the pinned run when it still exists,
 * otherwise the most recent, switchable via the picker.
 */
export function buildColumns(runs: AgentRun[], pinned: Record<string, string>, maxVisible: number): RunColumn[] {
  if (runs.length <= maxVisible) {
    return runs.map((run) => ({ projectId: run.projectId, runs: [run], effectiveRunId: run.id }));
  }

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
