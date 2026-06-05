import fs from "node:fs";
import path from "node:path";
import { applyDataDir, env, persistDataDirPointer } from "./env";
import { closeDb, db, initDb } from "./db";

const MOVED_DIR_NAME = "mangled-agents";

// Move the entire data directory into `${targetDir}/mangled-agents` and repoint the
// running app there. Fully synchronous, so it is atomic against every other DB write;
// failure-safe, so the old data is never destroyed until the new copy is open and the
// pointer is committed. Returns the new data dir.
export function relocateDataDir(targetDir: string): string {
  const resolvedTarget = path.resolve(targetDir);
  const dest = path.join(resolvedTarget, MOVED_DIR_NAME);
  const oldDir = env.dataDir;

  if (path.resolve(dest) === path.resolve(oldDir)) {
    throw new Error("the data directory is already here");
  }
  // Preflight while the DB is still open and untouched, so a bad target costs zero downtime.
  if (!fs.statSync(resolvedTarget).isDirectory()) throw new Error("not a directory");
  fs.accessSync(resolvedTarget, fs.constants.W_OK);
  if (fs.existsSync(dest)) throw new Error(`a "${MOVED_DIR_NAME}" folder already exists there`);

  closeDb();

  try {
    fs.cpSync(oldDir, dest, { recursive: true });
  } catch (err) {
    initDb(); // reopen the untouched old data dir
    fs.rmSync(dest, { recursive: true, force: true });
    throw err;
  }

  applyDataDir(dest);
  persistDataDirPointer(dest);
  try {
    initDb();
    db().prepare("SELECT 1").get();
  } catch (err) {
    applyDataDir(oldDir);
    persistDataDirPointer(oldDir === env.baseDir ? null : oldDir);
    initDb();
    fs.rmSync(dest, { recursive: true, force: true });
    throw err;
  }

  removeOldData(oldDir);
  return dest;
}

// Delete the old copy dead-last (best-effort). When the old dir is the anchor it also
// holds the pointer file, which must survive.
function removeOldData(oldDir: string): void {
  if (oldDir === env.baseDir) {
    for (const entry of fs.readdirSync(oldDir)) {
      if (path.join(oldDir, entry) === env.dataDirPointer) continue;
      fs.rmSync(path.join(oldDir, entry), { recursive: true, force: true });
    }
    return;
  }
  fs.rmSync(oldDir, { recursive: true, force: true });
}
