import { Router } from "express";
import { ticketsRepo } from "../db/tickets";
import { projectsRepo } from "../db/projects";
import { broadcast } from "../realtime/hub";
import { CreateTicketInput, MoveTicketInput, UpdateTicketInput } from "../../shared/types";

export const ticketsRouter = Router();

ticketsRouter.get("/tickets", (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  if (!projectId) {
    res.status(400).json({ error: "projectId query param required" });
    return;
  }
  res.json(ticketsRepo.listByProject(projectId));
});

ticketsRouter.post("/tickets", (req, res) => {
  const parsed = CreateTicketInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const project = projectsRepo.get(parsed.data.projectId);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const columnId = parsed.data.columnId ?? project.columns[0]?.id;
  if (!columnId || !project.columns.some((c) => c.id === columnId)) {
    res.status(400).json({ error: "invalid columnId for this project" });
    return;
  }
  const ticket = ticketsRepo.create({
    projectId: project.id,
    title: parsed.data.title,
    body: parsed.data.body,
    columnId,
  });
  broadcast({ type: "board.updated", projectId: project.id });
  res.status(201).json(ticket);
});

ticketsRouter.patch("/tickets/:id", (req, res) => {
  const parsed = UpdateTicketInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const ticket = ticketsRepo.update(req.params.id, parsed.data);
  if (!ticket) {
    res.status(404).json({ error: "ticket not found" });
    return;
  }
  broadcast({ type: "board.updated", projectId: ticket.projectId });
  res.json(ticket);
});

ticketsRouter.post("/tickets/:id/move", (req, res) => {
  const parsed = MoveTicketInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const ticket = ticketsRepo.move(req.params.id, parsed.data.columnId, parsed.data.position);
  if (!ticket) {
    res.status(404).json({ error: "ticket not found" });
    return;
  }
  broadcast({ type: "board.updated", projectId: ticket.projectId });
  res.json(ticket);
});

ticketsRouter.delete("/tickets/:id", (req, res) => {
  const ticket = ticketsRepo.get(req.params.id);
  if (!ticket) {
    res.status(404).end();
    return;
  }
  ticketsRepo.remove(req.params.id);
  broadcast({ type: "board.updated", projectId: ticket.projectId });
  res.status(204).end();
});
