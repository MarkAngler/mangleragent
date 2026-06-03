import { describe, it, expect, afterEach } from "vitest";
import { runsRepo } from "./runs";
import type { AgentRunKind, AgentRunStatus } from "../../shared/types";

describe("runsRepo.markRunningPtyStopped", () => {
  const created: string[] = [];
  const mk = (kind: AgentRunKind, status: AgentRunStatus) => {
    const r = runsRepo.create({ kind, title: "test run", status, cwd: "/tmp" });
    created.push(r.id);
    return r.id;
  };

  afterEach(() => {
    for (const id of created.splice(0)) runsRepo.remove(id);
  });

  it("stops orphaned running pty runs while leaving done pty and orchestrated runs untouched", () => {
    const runningPty = mk("pty", "running");
    const donePty = mk("pty", "done");
    const runningOrchestrated = mk("orchestrated", "running");

    runsRepo.markRunningPtyStopped();

    const revived = runsRepo.get(runningPty);
    expect(revived?.status).toBe("stopped");
    expect(revived?.endedAt).toBeTypeOf("number");
    expect(runsRepo.get(donePty)?.status).toBe("done");
    expect(runsRepo.get(runningOrchestrated)?.status).toBe("running");
  });
});
