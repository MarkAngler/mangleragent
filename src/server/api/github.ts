import { Router } from "express";
import { z } from "zod";
import { githubSourcesRepo } from "../db/githubSources";
import { getDefaultBranch, listDir, parseRepoUrl } from "../github/client";
import { syncAll, syncSource } from "../github/sync";
import { broadcast } from "../realtime/hub";
import { CreateGithubSourceInput, UpdateGithubSourceInput } from "../../shared/types";

export const githubRouter = Router();

githubRouter.get("/github/sources", (_req, res) => {
  res.json(githubSourcesRepo.list());
});

githubRouter.post("/github/sources", async (req, res) => {
  const parsed = CreateGithubSourceInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const repo = parseRepoUrl(parsed.data.url);
  if (!repo) {
    res.status(400).json({ error: "invalid repository URL" });
    return;
  }
  try {
    // Resolving the default branch also validates access (repo exists, token works).
    const branch = parsed.data.branch ?? repo.branch ?? (await getDefaultBranch(repo.owner, repo.repo));
    const source = githubSourcesRepo.create({
      owner: repo.owner,
      repo: repo.repo,
      branch,
      label: parsed.data.label,
      selections: parsed.data.selections,
    });
    broadcast({ type: "github.sources.updated" });
    res.status(201).json(source);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

githubRouter.patch("/github/sources/:id", (req, res) => {
  const parsed = UpdateGithubSourceInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const source = githubSourcesRepo.update(req.params.id, parsed.data);
  if (!source) {
    res.status(404).json({ error: "source not found" });
    return;
  }
  broadcast({ type: "github.sources.updated" });
  res.json(source);
});

githubRouter.delete("/github/sources/:id", (req, res) => {
  if (!githubSourcesRepo.remove(req.params.id)) {
    res.status(404).json({ error: "source not found" });
    return;
  }
  broadcast({ type: "github.sources.updated" });
  res.status(204).end();
});

const ResolveInput = z.object({ url: z.string().min(1) });

githubRouter.post("/github/resolve", async (req, res) => {
  const parsed = ResolveInput.safeParse(req.body);
  const repo = parsed.success ? parseRepoUrl(parsed.data.url) : undefined;
  if (!repo) {
    res.status(400).json({ error: "invalid repository URL" });
    return;
  }
  try {
    const branch = repo.branch ?? (await getDefaultBranch(repo.owner, repo.repo));
    res.json({ owner: repo.owner, repo: repo.repo, branch });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

githubRouter.get("/github/browse", async (req, res) => {
  const owner = String(req.query.owner ?? "");
  const repo = String(req.query.repo ?? "");
  const ref = String(req.query.ref ?? "");
  if (!owner || !repo || !ref) {
    res.status(400).json({ error: "owner, repo and ref required" });
    return;
  }
  try {
    res.json(await listDir(owner, repo, String(req.query.path ?? ""), ref));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

const SyncInput = z.object({ force: z.boolean().optional() });

githubRouter.post("/github/sources/:id/sync", async (req, res) => {
  const source = githubSourcesRepo.get(req.params.id);
  if (!source) {
    res.status(404).json({ error: "source not found" });
    return;
  }
  const parsed = SyncInput.safeParse(req.body ?? {});
  const outcome = await syncSource(source, { force: parsed.success ? parsed.data.force : false });
  broadcast({ type: "github.sources.updated" });
  if (outcome.status === "synced") broadcast({ type: "defs.updated" });
  res.json({ outcome, source: githubSourcesRepo.get(req.params.id) });
});

githubRouter.post("/github/sync", async (_req, res) => {
  await syncAll({ force: true });
  res.json({ ok: true });
});
