import { Router } from "express";
import { z } from "zod";
import { configRepo } from "../db/config";
import { env } from "../env";
import { relocateDataDir } from "../dataDir";
import { honchoConfigured, honchoWorkspace } from "../honcho";
import { DEFAULT_MANGLER_MODEL, DEFAULT_MANGLER_SYSTEM, manglerSystemPrompt } from "../agents/mangler";

export const settingsRouter = Router();

settingsRouter.get("/settings", (_req, res) => {
  res.json({
    anthropicConfigured: Boolean(env.anthropicApiKey),
    databricksConfigured: Boolean(env.databricksHost && env.databricksToken),
    provider: configRepo.get("mangler_provider") ?? "anthropic",
    honchoConfigured: honchoConfigured(),
    honchoEnabled: configRepo.getBool("honcho_enabled", false),
    honchoWorkspace: honchoWorkspace(),
    model: configRepo.get("mangler_model") ?? DEFAULT_MANGLER_MODEL,
    systemPrompt: manglerSystemPrompt(),
    defaultSystemPrompt: DEFAULT_MANGLER_SYSTEM,
    cliAutorun: configRepo.getBool("mangler_cli_autorun", false),
    cliWorkdir: configRepo.get("mangler_cli_workdir") ?? "",
    dataDir: env.dataDir,
  });
});

const MoveDataDirInput = z.object({ targetDir: z.string().min(1) });

settingsRouter.post("/settings/data-dir/move", (req, res) => {
  const parsed = MoveDataDirInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid target directory" });
    return;
  }
  try {
    const dataDir = relocateDataDir(parsed.data.targetDir);
    res.json({ ok: true, dataDir });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "move failed" });
  }
});

const PatchInput = z.object({
  provider: z.enum(["anthropic", "databricks"]).optional(),
  honchoEnabled: z.boolean().optional(),
  honchoWorkspace: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  systemPrompt: z.string().max(20000).optional(),
  cliAutorun: z.boolean().optional(),
  cliWorkdir: z.string().optional(),
});

settingsRouter.patch("/settings", (req, res) => {
  const parsed = PatchInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid settings" });
    return;
  }
  if (parsed.data.provider) configRepo.set("mangler_provider", parsed.data.provider);
  if (parsed.data.honchoEnabled !== undefined) configRepo.set("honcho_enabled", String(parsed.data.honchoEnabled));
  if (parsed.data.honchoWorkspace) configRepo.set("honcho_workspace", parsed.data.honchoWorkspace);
  if (parsed.data.model) configRepo.set("mangler_model", parsed.data.model);
  if (parsed.data.systemPrompt !== undefined) configRepo.set("mangler_system_prompt", parsed.data.systemPrompt);
  if (parsed.data.cliAutorun !== undefined) configRepo.set("mangler_cli_autorun", String(parsed.data.cliAutorun));
  if (parsed.data.cliWorkdir !== undefined) configRepo.set("mangler_cli_workdir", parsed.data.cliWorkdir);
  res.json({ ok: true });
});
