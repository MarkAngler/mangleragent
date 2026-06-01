import { Router } from "express";
import { z } from "zod";
import { configRepo } from "../db/config";
import { env } from "../env";
import { honchoConfigured, honchoWorkspace } from "../honcho";
import { databricksConfigured, databricksHost, databricksProfile } from "../databricks";
import { DEFAULT_MANGLER_MODEL, DEFAULT_MANGLER_SYSTEM, manglerSystemPrompt } from "../agents/mangler";

export const settingsRouter = Router();

settingsRouter.get("/settings", (_req, res) => {
  res.json({
    anthropicConfigured: Boolean(env.anthropicApiKey),
    honchoConfigured: honchoConfigured(),
    honchoEnabled: configRepo.getBool("honcho_enabled", false),
    honchoWorkspace: honchoWorkspace(),
    provider: configRepo.get("mangler_provider") ?? "anthropic",
    databricksConfigured: databricksConfigured(),
    databricksHost: databricksHost() ?? "",
    databricksProfile: databricksProfile(),
    model: configRepo.get("mangler_model") ?? DEFAULT_MANGLER_MODEL,
    systemPrompt: manglerSystemPrompt(),
    defaultSystemPrompt: DEFAULT_MANGLER_SYSTEM,
  });
});

const PatchInput = z.object({
  honchoEnabled: z.boolean().optional(),
  honchoWorkspace: z.string().min(1).optional(),
  provider: z.enum(["anthropic", "databricks"]).optional(),
  databricksHost: z.string().min(1).optional(),
  databricksProfile: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  systemPrompt: z.string().max(20000).optional(),
});

settingsRouter.patch("/settings", (req, res) => {
  const parsed = PatchInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid settings" });
    return;
  }
  if (parsed.data.honchoEnabled !== undefined) configRepo.set("honcho_enabled", String(parsed.data.honchoEnabled));
  if (parsed.data.honchoWorkspace) configRepo.set("honcho_workspace", parsed.data.honchoWorkspace);
  if (parsed.data.provider) configRepo.set("mangler_provider", parsed.data.provider);
  if (parsed.data.databricksHost) configRepo.set("databricks_host", parsed.data.databricksHost);
  if (parsed.data.databricksProfile) configRepo.set("databricks_profile", parsed.data.databricksProfile);
  if (parsed.data.model) configRepo.set("mangler_model", parsed.data.model);
  if (parsed.data.systemPrompt !== undefined) configRepo.set("mangler_system_prompt", parsed.data.systemPrompt);
  res.json({ ok: true });
});
