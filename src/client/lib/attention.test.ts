import { describe, it, expect } from "vitest";
import type { AgentRun, AgentRunStatus, AgentRunKind } from "../../shared/types";
import { needsInputRuns, diffCompletions, snapshotOf } from "./attention";

function run(id: string, status: AgentRunStatus, kind: AgentRunKind = "orchestrated"): AgentRun {
  return {
    id,
    projectId: null,
    ticketId: null,
    kind,
    title: id,
    status,
    approver: "human",
    permissionMode: "default",
    model: null,
    sdkSessionId: null,
    cwd: "/tmp",
    agentDef: null,
    summary: null,
    createdAt: 0,
    endedAt: null,
  };
}

describe("needsInputRuns", () => {
  it("counts orchestrated runs awaiting approval", () => {
    const runs = [run("a", "awaiting_approval"), run("b", "running")];
    expect(needsInputRuns(runs, new Set()).map((r) => r.id)).toEqual(["a"]);
  });

  it("counts a pty run only when it is in the waiting set", () => {
    const runs = [run("t", "running", "pty")];
    expect(needsInputRuns(runs, new Set()).map((r) => r.id)).toEqual([]);
    expect(needsInputRuns(runs, new Set(["t"])).map((r) => r.id)).toEqual(["t"]);
  });

  it("excludes terminal runs", () => {
    const runs = [run("a", "done"), run("b", "failed"), run("c", "stopped")];
    expect(needsInputRuns(runs, new Set(["a", "b", "c"]))).toEqual([]);
  });
});

describe("diffCompletions", () => {
  it("does not fire when a run is already terminal in the baseline", () => {
    const prev = snapshotOf([run("a", "done")]);
    expect(diffCompletions(prev, [run("a", "done")])).toEqual([]);
  });

  it("does not fire for runs absent from the baseline (initial seed)", () => {
    expect(diffCompletions({}, [run("a", "done")])).toEqual([]);
  });

  it("fires when a non-terminal run transitions to done or failed", () => {
    const prev = snapshotOf([run("a", "running"), run("b", "planning")]);
    expect(diffCompletions(prev, [run("a", "done"), run("b", "failed")])).toEqual([
      { runId: "a", status: "done" },
      { runId: "b", status: "failed" },
    ]);
  });

  it("does not fire when a run transitions to stopped", () => {
    const prev = snapshotOf([run("a", "running")]);
    expect(diffCompletions(prev, [run("a", "stopped")])).toEqual([]);
  });
});
