import { Router } from "express";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { projectsRepo } from "../db/projects";
import { commit, gitStatus, listBranches, push, runDiff, switchBranch } from "../git";
import { CommitInput, CreateProjectInput, SwitchBranchInput, UpdateProjectInput } from "../../shared/types";

const CODE_BIN = process.env.MANGLED_CODE_BIN ?? "code";

export const projectsRouter = Router();

projectsRouter.get("/projects", (_req, res) => {
  res.json(projectsRepo.list());
});

projectsRouter.get("/projects/:id", (req, res) => {
  const project = projectsRepo.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(project);
});

projectsRouter.post("/projects/:id/open", (req, res) => {
  const project = projectsRepo.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  execFile(CODE_BIN, [project.path], (err) => {
    if (err) {
      console.error(`failed to open ${project.path} in VS Code:`, err.message);
      res.status(500).json({ error: "could not launch VS Code — is the 'code' command installed and on PATH?" });
      return;
    }
    res.json({ ok: true });
  });
});

projectsRouter.get("/projects/:id/branches", (req, res) => {
  const project = projectsRepo.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(listBranches(project.path));
});

projectsRouter.post("/projects/:id/branches/switch", (req, res) => {
  const project = projectsRepo.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const parsed = SwitchBranchInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  try {
    res.json(switchBranch(project.path, parsed.data.branch, parsed.data.create ?? false));
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr?.toString().trim();
    res.status(409).json({ error: stderr || "git checkout failed" });
  }
});

projectsRouter.get("/projects/:id/diff", (req, res) => {
  const project = projectsRepo.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(runDiff(project.path));
});

projectsRouter.get("/projects/:id/git-status", (req, res) => {
  const project = projectsRepo.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(gitStatus(project.path));
});

projectsRouter.post("/projects/:id/commit", (req, res) => {
  const project = projectsRepo.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  const parsed = CommitInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  try {
    res.json({ hash: commit(project.path, parsed.data.message) });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr?.toString().trim();
    res.status(409).json({ error: stderr || "git commit failed" });
  }
});

projectsRouter.post("/projects/:id/push", (req, res) => {
  const project = projectsRepo.get(req.params.id);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  try {
    res.json({ output: push(project.path) });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer | string }).stderr?.toString().trim();
    res.status(409).json({ error: stderr || "git push failed" });
  }
});

projectsRouter.post("/projects", (req, res) => {
  const parsed = CreateProjectInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const abs = path.resolve(parsed.data.path);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    res.status(400).json({ error: `path does not exist: ${abs}` });
    return;
  }
  if (!stat.isDirectory()) {
    res.status(400).json({ error: "path is not a directory" });
    return;
  }
  const existing = projectsRepo.findByPath(abs);
  if (existing) {
    res.status(409).json({ error: "a project already points at this folder", project: existing });
    return;
  }
  const project = projectsRepo.create({ path: abs, name: parsed.data.name, description: parsed.data.description });
  res.status(201).json(project);
});

projectsRouter.patch("/projects/:id", (req, res) => {
  const parsed = UpdateProjectInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    return;
  }
  const project = projectsRepo.update(req.params.id, parsed.data);
  if (!project) {
    res.status(404).json({ error: "project not found" });
    return;
  }
  res.json(project);
});

projectsRouter.delete("/projects/:id", (req, res) => {
  const removed = projectsRepo.remove(req.params.id);
  res.status(removed ? 204 : 404).end();
});
