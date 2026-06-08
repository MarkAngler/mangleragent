import { describe, it, expect } from "vitest";
import type { AgentRun } from "../../shared/types";
import { buildColumns, NO_PROJECT_KEY } from "./agentColumns";

function run(id: string, projectId: string | null): AgentRun {
  return {
    id,
    projectId,
    ticketId: null,
    kind: "pty",
    title: id,
    status: "running",
    approver: "human",
    permissionMode: "plan",
    model: null,
    cli: null,
    sdkSessionId: null,
    cwd: "/x",
    agentDef: null,
    summary: null,
    createdAt: 0,
    endedAt: null,
  };
}

describe("buildColumns", () => {
  // Runs arrive newest-first from the /runs API.
  const runs = [run("a3", "p1"), run("b1", "p2"), run("a1", "p1")];
  // Below the run count, so columns collapse to one per project.
  const collapse = 2;

  it("groups by project, keeps runs newest-first, orders columns by most-recent run", () => {
    expect(buildColumns(runs, {}, collapse)).toEqual([
      { projectId: "p1", runs: [run("a3", "p1"), run("a1", "p1")], effectiveRunId: "a3" },
      { projectId: "p2", runs: [run("b1", "p2")], effectiveRunId: "b1" },
    ]);
  });

  it("defaults the effective run to the most recent when unpinned", () => {
    expect(buildColumns(runs, {}, collapse)[0].effectiveRunId).toBe("a3");
  });

  it("honors a pin when the pinned run still exists", () => {
    expect(buildColumns(runs, { p1: "a1" }, collapse)[0].effectiveRunId).toBe("a1");
  });

  it("falls back to the most recent when the pinned run is gone", () => {
    expect(buildColumns(runs, { p1: "deleted" }, collapse)[0].effectiveRunId).toBe("a3");
  });

  it("buckets null-project runs under NO_PROJECT_KEY and pins via that key", () => {
    const withNull = [run("n2", null), run("p", "p1"), run("n1", null)];
    const columns = buildColumns(withNull, { [NO_PROJECT_KEY]: "n1" }, collapse);
    expect(columns[0]).toEqual({
      projectId: null,
      runs: [run("n2", null), run("n1", null)],
      effectiveRunId: "n1",
    });
  });

  it("expands to one column per run when the count is at most maxVisible", () => {
    expect(buildColumns(runs, {}, runs.length)).toEqual([
      { projectId: "p1", runs: [run("a3", "p1")], effectiveRunId: "a3" },
      { projectId: "p2", runs: [run("b1", "p2")], effectiveRunId: "b1" },
      { projectId: "p1", runs: [run("a1", "p1")], effectiveRunId: "a1" },
    ]);
  });

  it("collapses once the count exceeds maxVisible by one", () => {
    expect(buildColumns(runs, {}, runs.length - 1)).toEqual([
      { projectId: "p1", runs: [run("a3", "p1"), run("a1", "p1")], effectiveRunId: "a3" },
      { projectId: "p2", runs: [run("b1", "p2")], effectiveRunId: "b1" },
    ]);
  });
});
