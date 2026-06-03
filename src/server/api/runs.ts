import { Router } from "express";
import { randomUUID } from "node:crypto";
import { runsRepo } from "../db/runs";
import { projectsRepo } from "../db/projects";
import { ticketsRepo } from "../db/tickets";
import { eventsRepo } from "../db/events";
import { permissionsRepo } from "../db/permissions";
import { startPtySession, stopPtySession, isPtyAlive } from "../agents/pty";
import { startOrchestratedRun, stopOrchestratedRun, decideApproval } from "../agents/orchestrator";
import { truncateForTitle } from "../agents/runTitle";
import { runDiff } from "../git";
import { broadcast } from "../realtime/hub";
import { CreateOrchestratedRunInput, CreatePtyRunInput, DecideInput } from "../../shared/types";

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
  const title = ticket ? ticket.title : "Terminal";

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
  // Pin a known session id so the terminal can be resumed (claude --resume) after a restart.
  const sessionId = randomUUID();
  runsRepo.setSessionId(run.id, sessionId);
  run.sdkSessionId = sessionId;
  startPtySession(run.id, project.path, { sessionId });
  res.status(201).json(run);
});

runsRouter.post("/runs/orchestrated", (req, res) => {
  const parsed = CreateOrchestratedRunInput.safeParse(req.body);
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
  const prompt =
    parsed.data.prompt ??
    (ticket ? `Work on this ticket and implement it.\n\nTitle: ${ticket.title}\n\n${ticket.body || "(no description)"}` : undefined);
  if (!prompt) {
    res.status(400).json({ error: "prompt or ticketId required" });
    return;
  }

  const run = runsRepo.create({
    projectId: project.id,
    ticketId: ticket?.id ?? null,
    kind: "orchestrated",
    title: ticket ? ticket.title : truncateForTitle(prompt),
    status: "planning",
    approver: parsed.data.approver ?? "human",
    permissionMode: "plan",
    model: parsed.data.model ?? null,
    cwd: project.path,
  });
  void startOrchestratedRun(run, prompt);
  broadcast({ type: "run.updated", runId: run.id });
  res.status(201).json(run);
});

runsRouter.get("/runs/:id/events", (req, res) => {
  res.json(eventsRepo.listByRun(req.params.id));
});

runsRouter.get("/runs/:id/permissions", (req, res) => {
  res.json(permissionsRepo.listByRun(req.params.id));
});

runsRouter.get("/runs/:id/diff", (req, res) => {
  const run = runsRepo.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  res.json(runDiff(run.cwd));
});

runsRouter.post("/permissions/:id/decide", (req, res) => {
  const parsed = DecideInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "approved (boolean) required" });
    return;
  }
  if (!decideApproval(req.params.id, parsed.data.approved, parsed.data.reason)) {
    res.status(409).json({ error: "no pending approval for this request" });
    return;
  }
  res.json({ ok: true });
});

runsRouter.post("/runs/:id/stop", (req, res) => {
  const run = runsRepo.get(req.params.id);
  if (!run) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  if (run.kind === "orchestrated") {
    stopOrchestratedRun(run.id);
  } else if (!stopPtySession(run.id)) {
    runsRepo.setStatus(run.id, "stopped");
    broadcast({ type: "run.updated", runId: run.id });
  }
  res.json({ ok: true });
});

runsRouter.delete("/runs/:id", (req, res) => {
  stopPtySession(req.params.id);
  stopOrchestratedRun(req.params.id);
  res.status(runsRepo.remove(req.params.id) ? 204 : 404).end();
});
