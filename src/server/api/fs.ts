import { Router } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BrowseResult, DirEntry } from "../../shared/types";

export const fsRouter = Router();

// Localhost-only directory browser used to pick a project folder. The server
// binds to 127.0.0.1, so this exposes the user's own filesystem only to them.
fsRouter.get("/fs/browse", (req, res) => {
  const raw = typeof req.query.path === "string" && req.query.path.length > 0 ? req.query.path : os.homedir();
  const dir = path.resolve(raw);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(dir);
  } catch {
    res.status(400).json({ error: `cannot access: ${dir}` });
    return;
  }
  if (!stat.isDirectory()) {
    res.status(400).json({ error: "not a directory" });
    return;
  }

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    res.status(403).json({ error: `permission denied: ${dir}` });
    return;
  }

  const entries: DirEntry[] = dirents
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => {
      const full = path.join(dir, entry.name);
      return { name: entry.name, path: full, hasGit: fs.existsSync(path.join(full, ".git")) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = path.dirname(dir);
  const result: BrowseResult = { path: dir, parent: parent === dir ? null : parent, entries };
  res.json(result);
});
