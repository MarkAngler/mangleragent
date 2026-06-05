import { config } from "dotenv";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

config({ quiet: true });

// The anchor is fixed for the process lifetime; the data dir can be relocated at
// runtime and is recorded in a pointer file that always lives in the anchor, so
// it is found before the (possibly moved) data dir is opened.
const baseDir = process.env.MANGLED_DATA_DIR ?? path.join(os.homedir(), ".mangled-agents");
fs.mkdirSync(baseDir, { recursive: true });

const POINTER_NAME = "data-location";

function dbPathFor(dir: string): string {
  return path.join(dir, "data.db");
}

function runsDirFor(dir: string): string {
  return path.join(dir, "runs");
}

// Resolve the effective data dir from the anchor's pointer file, falling back to
// the anchor when there is no pointer or it points at a missing directory.
export function resolveDataDir(anchor: string): string {
  try {
    const pointed = fs.readFileSync(path.join(anchor, POINTER_NAME), "utf8").trim();
    if (pointed && fs.existsSync(pointed)) return pointed;
  } catch {
    // No pointer file — use the anchor.
  }
  return anchor;
}

const dataDir = resolveDataDir(baseDir);
fs.mkdirSync(dataDir, { recursive: true });

// Both the Anthropic SDK and the Agent SDK read ANTHROPIC_API_KEY; accept the
// project's CLAUDE_API_KEY as an alias so a single key in .env powers both.
const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY;
if (anthropicApiKey) process.env.ANTHROPIC_API_KEY = anthropicApiKey;

export const env = {
  baseDir,
  dataDirPointer: path.join(baseDir, POINTER_NAME),
  dataDir,
  dbPath: dbPathFor(dataDir),
  runsDir: runsDirFor(dataDir),
  anthropicApiKey,
  databricksHost: process.env.DATABRICKS_HOST ?? process.env.DATABRICKS_WORKSPACE,
  databricksToken: process.env.DATABRICKS_TOKEN ?? process.env.DATABRICKS_PAT,
  honchoApiKey: process.env.HONCHO_API_KEY ?? process.env.HONCHO_DEV_API_KEY,
  port: Number(process.env.PORT ?? 4173),
  isDev: process.env.MANGLED_DEV === "1",
};

fs.mkdirSync(env.runsDir, { recursive: true });

// Repoint the live env at a relocated data dir. In-memory only; consumers read
// env.dataDir/dbPath/runsDir at call time, so this takes effect immediately.
export function applyDataDir(dir: string): void {
  env.dataDir = dir;
  env.dbPath = dbPathFor(dir);
  env.runsDir = runsDirFor(dir);
}

// Persist (or clear, when back at the anchor) the pointer so the move survives a restart.
export function persistDataDirPointer(dir: string | null): void {
  if (dir === null) {
    fs.rmSync(env.dataDirPointer, { force: true });
    return;
  }
  fs.writeFileSync(env.dataDirPointer, dir);
}
