import { Router } from "express";
import { tasksRepo } from "../db/tasks";
import { broadcast } from "../realtime/hub";
import { CreateTaskInput, UpdateTaskInput } from "../../shared/types";

export const tasksRouter = Router();

tasksRouter.get("/tasks", (_req, res) => {
  res.json(tasksRepo.list());
});

tasksRouter.post("/tasks", (req, res) => {
  const parsed = CreateTaskInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const task = tasksRepo.create(parsed.data);
  broadcast({ type: "tasks.updated" });
  res.status(201).json(task);
});

tasksRouter.patch("/tasks/:id", (req, res) => {
  const parsed = UpdateTaskInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const task = tasksRepo.update(req.params.id, parsed.data);
  if (!task) {
    res.status(404).json({ error: "task not found" });
    return;
  }
  broadcast({ type: "tasks.updated" });
  res.json(task);
});

tasksRouter.delete("/tasks/:id", (req, res) => {
  const removed = tasksRepo.remove(req.params.id);
  if (removed) broadcast({ type: "tasks.updated" });
  res.status(removed ? 204 : 404).end();
});
