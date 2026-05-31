import { Router } from "express";
import { z } from "zod";
import { configRepo } from "../db/config";
import { env } from "../env";
import { honchoConfigured } from "../honcho";
import { DEFAULT_MANGLER_MODEL } from "../agents/mangler";

export const settingsRouter = Router();

settingsRouter.get("/settings", (_req, res) => {
  res.json({
    anthropicConfigured: Boolean(env.anthropicApiKey),
    honchoConfigured: honchoConfigured(),
    honchoEnabled: configRepo.getBool("honcho_enabled", false),
    model: configRepo.get("mangler_model") ?? DEFAULT_MANGLER_MODEL,
  });
});

const PatchInput = z.object({ honchoEnabled: z.boolean().optional(), model: z.string().min(1).optional() });

settingsRouter.patch("/settings", (req, res) => {
  const parsed = PatchInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid settings" });
    return;
  }
  if (parsed.data.honchoEnabled !== undefined) configRepo.set("honcho_enabled", String(parsed.data.honchoEnabled));
  if (parsed.data.model) configRepo.set("mangler_model", parsed.data.model);
  res.json({ ok: true });
});
