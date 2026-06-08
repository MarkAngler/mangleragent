import { Router } from "express";
import { agentsRepo } from "../db/agents";
import { runsRepo } from "../db/runs";
import { projectsRepo } from "../db/projects";
import { conversationsRepo } from "../db/chat";
import { startAgentRun, agentWorkspaceDir } from "../agents/agentRun";
import { broadcast } from "../realtime/hub";
import { CreateAgentInput, RunAgentInput, UpdateAgentInput } from "../../shared/types";

export const agentsRouter = Router();

agentsRouter.get("/agents", (_req, res) => {
  res.json(agentsRepo.list());
});

agentsRouter.get("/agents/:id", (req, res) => {
  const agent = agentsRepo.get(req.params.id);
  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.json(agent);
});

agentsRouter.post("/agents", (req, res) => {
  const parsed = CreateAgentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  res.status(201).json(agentsRepo.create(parsed.data));
});

agentsRouter.patch("/agents/:id", (req, res) => {
  const parsed = UpdateAgentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const updated = agentsRepo.update(req.params.id, parsed.data);
  if (!updated) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.json(updated);
});

agentsRouter.delete("/agents/:id", (req, res) => {
  res.status(agentsRepo.remove(req.params.id) ? 204 : 404).end();
});

// Kick off a one-shot background run of this agent. Watched in Active Agents via run events.
agentsRouter.post("/agents/:id/run", (req, res) => {
  const agent = agentsRepo.get(req.params.id);
  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  const parsed = RunAgentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  let cwd = agentWorkspaceDir();
  if (parsed.data.projectId) {
    const project = projectsRepo.get(parsed.data.projectId);
    if (!project) {
      res.status(404).json({ error: "project not found" });
      return;
    }
    cwd = project.path;
  }
  const run = runsRepo.create({
    projectId: parsed.data.projectId ?? null,
    kind: "agent",
    title: agent.name,
    status: "running",
    approver: agent.approval === "human" ? "human" : "agent",
    permissionMode: "default",
    model: agent.model,
    cwd,
    agentDef: agent.id,
  });
  void startAgentRun(run, parsed.data.prompt, agent);
  broadcast({ type: "run.updated", runId: run.id });
  res.status(201).json(run);
});

agentsRouter.get("/agents/:id/conversations", (req, res) => {
  if (!agentsRepo.get(req.params.id)) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.json(conversationsRepo.listByLocalAgent(req.params.id));
});

agentsRouter.post("/agents/:id/conversations", (req, res) => {
  if (!agentsRepo.get(req.params.id)) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.status(201).json(conversationsRepo.create("New conversation", null, req.params.id));
});
