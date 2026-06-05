import { Router } from "express";
import { registeredAgentsRepo } from "../db/registeredAgents";
import { conversationsRepo } from "../db/chat";
import { invokeDatabricksAgent } from "../agents/databricks";
import { CreateRegisteredAgentInput, UpdateRegisteredAgentInput } from "../../shared/types";

export const externalAgentsRouter = Router();

externalAgentsRouter.get("/external-agents", (_req, res) => {
  res.json(registeredAgentsRepo.list());
});

externalAgentsRouter.get("/external-agents/:id", (req, res) => {
  const agent = registeredAgentsRepo.get(req.params.id);
  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.json(agent);
});

externalAgentsRouter.post("/external-agents", (req, res) => {
  const parsed = CreateRegisteredAgentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  res.status(201).json(registeredAgentsRepo.create(parsed.data));
});

externalAgentsRouter.patch("/external-agents/:id", (req, res) => {
  const parsed = UpdateRegisteredAgentInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const updated = registeredAgentsRepo.update(req.params.id, parsed.data);
  if (!updated) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.json(updated);
});

externalAgentsRouter.delete("/external-agents/:id", (req, res) => {
  res.status(registeredAgentsRepo.remove(req.params.id) ? 204 : 404).end();
});

// Send a one-shot ping to verify the endpoint name resolves and responds.
externalAgentsRouter.post("/external-agents/:id/test", async (req, res) => {
  const agent = registeredAgentsRepo.get(req.params.id);
  if (!agent) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  try {
    const reply = await invokeDatabricksAgent({ endpoint: agent.endpoint, messages: [{ role: "user", content: "ping" }] });
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

externalAgentsRouter.get("/external-agents/:id/conversations", (req, res) => {
  if (!registeredAgentsRepo.get(req.params.id)) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.json(conversationsRepo.listByAgent(req.params.id));
});

externalAgentsRouter.post("/external-agents/:id/conversations", (req, res) => {
  if (!registeredAgentsRepo.get(req.params.id)) {
    res.status(404).json({ error: "agent not found" });
    return;
  }
  res.status(201).json(conversationsRepo.create("New conversation", req.params.id));
});
