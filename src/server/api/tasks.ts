import { Router } from "express";
import { tasksRepo } from "../db/tasks";
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
  res.status(201).json(tasksRepo.create(parsed.data));
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
  res.json(task);
});

tasksRouter.delete("/tasks/:id", (req, res) => {
  res.status(tasksRepo.remove(req.params.id) ? 204 : 404).end();
});
