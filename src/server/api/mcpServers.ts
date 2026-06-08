import { Router } from "express";
import { mcpServersRepo } from "../db/mcpServers";
import { invalidateMcpServer, testMcpServer } from "../agents/mcp";
import { CreateMcpServerInput, UpdateMcpServerInput } from "../../shared/types";

export const mcpServersRouter = Router();

mcpServersRouter.get("/mcp-servers", (_req, res) => {
  res.json(mcpServersRepo.list());
});

mcpServersRouter.get("/mcp-servers/:id", (req, res) => {
  const server = mcpServersRepo.get(req.params.id);
  if (!server) {
    res.status(404).json({ error: "mcp server not found" });
    return;
  }
  res.json(server);
});

mcpServersRouter.post("/mcp-servers", (req, res) => {
  const parsed = CreateMcpServerInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  res.status(201).json(mcpServersRepo.create(parsed.data));
});

mcpServersRouter.patch("/mcp-servers/:id", (req, res) => {
  const parsed = UpdateMcpServerInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const updated = mcpServersRepo.update(req.params.id, parsed.data);
  if (!updated) {
    res.status(404).json({ error: "mcp server not found" });
    return;
  }
  invalidateMcpServer(updated.id);
  res.json(updated);
});

mcpServersRouter.delete("/mcp-servers/:id", (req, res) => {
  const removed = mcpServersRepo.remove(req.params.id);
  if (removed) invalidateMcpServer(req.params.id);
  res.status(removed ? 204 : 404).end();
});

// Connect to the server and list its tools to verify the config resolves and responds.
mcpServersRouter.post("/mcp-servers/:id/test", async (req, res) => {
  const server = mcpServersRepo.get(req.params.id);
  if (!server) {
    res.status(404).json({ error: "mcp server not found" });
    return;
  }
  try {
    const { toolNames } = await testMcpServer(server);
    res.json({ ok: true, toolCount: toolNames.length, toolNames });
  } catch (err) {
    console.error(`[mcp] test failed for "${server.name}": ${(err as Error).message}`);
    res.status(400).json({ error: (err as Error).message });
  }
});
