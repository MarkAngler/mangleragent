import { Router } from "express";
import { env } from "../env";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "mangled-agents",
    time: new Date().toISOString(),
    anthropic: Boolean(env.anthropicApiKey),
    honcho: Boolean(env.honchoApiKey),
  });
});
