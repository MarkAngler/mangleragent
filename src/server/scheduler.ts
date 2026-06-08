import { schedulesRepo } from "./db/schedules";
import { conversationsRepo, messagesRepo } from "./db/chat";
import { agentsRepo } from "./db/agents";
import { runsRepo } from "./db/runs";
import { broadcast } from "./realtime/hub";
import { runMangler } from "./agents/mangler";
import { startAgentRun, agentWorkspaceDir } from "./agents/agentRun";
import { nextRun } from "./cron";
import type { Schedule } from "../shared/types";

const TICK_MS = 30_000;

// Guards against a slow Mangler run overlapping its own next fire.
const inFlight = new Set<string>();

// Run a schedule's occurrence. A schedule either runs a specific agent directly (agentId set) or
// runs its prompt through Mangler in a dedicated conversation. Does NOT advance next_run_at — cron
// advancement is the scheduler's job (so manual "run now" can reuse this).
export async function fireSchedule(schedule: Schedule): Promise<void> {
  if (inFlight.has(schedule.id)) return;
  inFlight.add(schedule.id);
  try {
    if (schedule.agentId) {
      await fireAgentSchedule(schedule);
      return;
    }
    let conversationId = schedule.conversationId;
    if (!conversationId || !conversationsRepo.get(conversationId)) {
      conversationId = conversationsRepo.create(`⏰ ${schedule.title}`).id;
      schedulesRepo.setConversationId(schedule.id, conversationId);
    }
    messagesRepo.add(conversationId, "user", schedule.prompt);
    schedulesRepo.markRan(schedule.id, Date.now());
    broadcast({ type: "schedule.updated", scheduleId: schedule.id });
    await runMangler(conversationId);
  } finally {
    inFlight.delete(schedule.id);
  }
}

async function fireAgentSchedule(schedule: Schedule): Promise<void> {
  const agent = schedule.agentId ? agentsRepo.get(schedule.agentId) : undefined;
  if (!agent) return; // agent was deleted; skip silently until the schedule is edited
  const run = runsRepo.create({
    kind: "agent",
    title: agent.name,
    status: "running",
    approver: agent.approval === "human" ? "human" : "agent",
    permissionMode: "default",
    model: agent.model,
    cwd: agentWorkspaceDir(),
    agentDef: agent.id,
  });
  schedulesRepo.markRan(schedule.id, Date.now());
  broadcast({ type: "schedule.updated", scheduleId: schedule.id });
  broadcast({ type: "run.updated", runId: run.id });
  await startAgentRun(run, schedule.prompt, agent);
}

function tick(): void {
  for (const schedule of schedulesRepo.listDue(Date.now())) {
    try {
      schedulesRepo.setNextRun(schedule.id, nextRun(schedule.cron));
    } catch {
      // A malformed expression (e.g. hand-edited DB) would otherwise fire every tick; pause it.
      schedulesRepo.setNextRun(schedule.id, null);
      continue;
    }
    void fireSchedule(schedule);
  }
}

export function startScheduler(): void {
  // Recompute next fire times on boot — to the next future occurrence, with no backfill of
  // runs missed while the server was down.
  for (const schedule of schedulesRepo.list()) {
    try {
      schedulesRepo.setNextRun(schedule.id, schedule.enabled ? nextRun(schedule.cron) : null);
    } catch {
      schedulesRepo.setNextRun(schedule.id, null);
    }
  }
  setInterval(tick, TICK_MS).unref();
}
