import { describe, it, expect, beforeAll, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Isolate the data dir before importing modules that resolve env at load time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ma-scheduler-test-"));
process.env.MANGLED_DATA_DIR = tmp;

// fireSchedule's agent path kicks off a real SDK run; stub it so we only test run creation/bookkeeping.
vi.mock("./agents/agentRun", () => ({ startAgentRun: vi.fn(), agentWorkspaceDir: () => "/tmp/agent-workspace" }));

const { initDb } = await import("./db/index");
const { agentsRepo } = await import("./db/agents");
const { schedulesRepo } = await import("./db/schedules");
const { runsRepo } = await import("./db/runs");
const { fireSchedule } = await import("./scheduler");
const { startAgentRun } = await import("./agents/agentRun");

describe("fireSchedule with an agent target", () => {
  beforeAll(() => {
    initDb();
  });

  it("starts an agent run tagged with the agent id and marks the schedule run", async () => {
    const agent = agentsRepo.create({ name: "Daily reviewer", approval: "none" });
    const schedule = schedulesRepo.create({ title: "daily", prompt: "review tickets", cron: "0 9 * * *", agentId: agent.id, enabled: true, nextRunAt: 1 });

    await fireSchedule(schedule);

    expect(startAgentRun).toHaveBeenCalledTimes(1);
    const run = runsRepo.list().find((r) => r.agentDef === agent.id);
    expect(run?.kind).toBe("agent");
    expect(schedulesRepo.get(schedule.id)?.lastRunAt).not.toBeNull();
  });

  it("skips silently when the targeted agent was deleted after the schedule was read", async () => {
    const agent = agentsRepo.create({ name: "Doomed", approval: "none" });
    const schedule = schedulesRepo.create({ title: "orphan", prompt: "x", cron: "0 9 * * *", agentId: agent.id, enabled: true, nextRunAt: 1 });
    agentsRepo.remove(agent.id); // SET NULL on the row, but our in-memory snapshot still points at it

    const before = vi.mocked(startAgentRun).mock.calls.length;
    await expect(fireSchedule(schedule)).resolves.toBeUndefined();
    expect(vi.mocked(startAgentRun).mock.calls.length).toBe(before);
  });
});
