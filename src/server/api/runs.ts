import { Router } from "express";
import { runsRepo } from "../db/runs";
import { projectsRepo } from "../db/projects";
import { ticketsRepo } from "../db/tickets";
import { startPtySession, stopPtySession, isPtyAlive } from "../agents/pty";
import { broadcast } from "../realtime/hub";
import { CreatePtyRunInput } from "../../shared/types";

export const runsRouter = Router();

runsRouter.get("/runs", (_req, res) => {
  res.json(runsRepo.list());
});

runsRouter.get("/runs/:id", (req, res) => {
  const run = runsRepo.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  res.json({ ...run, alive: isPtyAlive(run.id) });
});

runsRouter.post("/runs/pty", (req, res) => {
  const parsed = CreatePtyRunInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const project = projectsRepo.get(parsed.data.projectId);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const ticket = parsed.data.ticketId ? ticketsRepo.get(parsed.data.ticketId) : undefined;
  const title = ticket ? `Terminal · ${ticket.title}` : `Terminal · ${project.name}`;

  const run = runsRepo.create({
    projectId: project.id,
    ticketId: ticket?.id ?? null,
    kind: "pty",
    title,
    status: "running",
    approver: "human",
    permissionMode: "interactive",
    cwd: project.path,
  });
  startPtySession(run.id, project.path);
  broadcast({ type: "run.updated", runId: run.id });
  res.status(201).json(run);
});

runsRouter.post("/runs/:id/stop", (req, res) => {
  const run = runsRepo.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  if (!stopPtySession(run.id)) {
    runsRepo.setStatus(run.id, "stopped");
    broadcast({ type: "run.updated", runId: run.id });
  }
  res.json({ ok: true });
});

runsRouter.delete("/runs/:id", (req, res) => {
  stopPtySession(req.params.id);
  res.status(runsRepo.remove(req.params.id) ? 204 : 404).end();
});
