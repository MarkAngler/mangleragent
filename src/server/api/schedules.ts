import { Router } from "express";
import { schedulesRepo } from "../db/schedules";
import { broadcast } from "../realtime/hub";
import { isValidCron, nextRun } from "../cron";
import { fireSchedule } from "../scheduler";
import { CreateScheduleInput, UpdateScheduleInput } from "../../shared/types";

export const schedulesRouter = Router();

schedulesRouter.get("/schedules", (_req, res) => {
  res.json(schedulesRepo.list());
});

schedulesRouter.post("/schedules", (req, res) => {
  const parsed = CreateScheduleInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  if (!isValidCron(parsed.data.cron)) {
    res.status(400).json({ error: "invalid cron expression" });
    return;
  }
  const enabled = parsed.data.enabled ?? true;
  const schedule = schedulesRepo.create({
    title: parsed.data.title,
    prompt: parsed.data.prompt,
    cron: parsed.data.cron,
    agentId: parsed.data.agentId ?? null,
    enabled,
    nextRunAt: enabled ? nextRun(parsed.data.cron) : null,
  });
  broadcast({ type: "schedule.updated", scheduleId: schedule.id });
  res.status(201).json(schedule);
});

schedulesRouter.patch("/schedules/:id", (req, res) => {
  const parsed = UpdateScheduleInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const existing = schedulesRepo.get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "schedule not found" });
    return;
  }
  const cron = parsed.data.cron ?? existing.cron;
  if (parsed.data.cron !== undefined && !isValidCron(parsed.data.cron)) {
    res.status(400).json({ error: "invalid cron expression" });
    return;
  }
  // Recompute the next fire time whenever the timing or enablement changes.
  const enabled = parsed.data.enabled ?? existing.enabled;
  const rescheduled = parsed.data.cron !== undefined || parsed.data.enabled !== undefined;
  const schedule = schedulesRepo.update(req.params.id, {
    ...parsed.data,
    ...(rescheduled ? { nextRunAt: enabled ? nextRun(cron) : null } : {}),
  });
  broadcast({ type: "schedule.updated", scheduleId: req.params.id });
  res.json(schedule);
});

schedulesRouter.post("/schedules/:id/run", (req, res) => {
  const schedule = schedulesRepo.get(req.params.id);
  if (!schedule) {
    res.status(404).json({ error: "schedule not found" });
    return;
  }
  void fireSchedule(schedule);
  res.status(202).json({ ok: true });
});

schedulesRouter.delete("/schedules/:id", (req, res) => {
  const removed = schedulesRepo.remove(req.params.id);
  if (removed) broadcast({ type: "schedule.updated", scheduleId: req.params.id });
  res.status(removed ? 204 : 404).end();
});
