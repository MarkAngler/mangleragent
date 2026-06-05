import Database from "better-sqlite3";
import { env } from "../env";
import { SCHEMA } from "./schema";

let database: Database.Database | null = null;

export function initDb(): Database.Database {
  if (database) return database;
  database = new Database(env.dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA);
  // Migrate pre-existing databases: SCHEMA only CREATE TABLE IF NOT EXISTS, so new columns
  // on an already-created table need an explicit, idempotent ADD COLUMN.
  const projectCols = database.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projectCols.some((c) => c.name === "description")) {
    database.exec("ALTER TABLE projects ADD COLUMN description TEXT NOT NULL DEFAULT ''");
  }
  const conversationCols = database.prepare("PRAGMA table_info(conversations)").all() as { name: string }[];
  if (!conversationCols.some((c) => c.name === "agent_id")) {
    database.exec("ALTER TABLE conversations ADD COLUMN agent_id TEXT REFERENCES registered_agents(id) ON DELETE CASCADE");
  }
  return database;
}

export function db(): Database.Database {
  if (!database) return initDb();
  return database;
}

// Checkpoint the WAL into the main file and close, so data.db is self-contained
// and safe to copy. The next db()/initDb() reopens at the current env.dbPath.
export function closeDb(): void {
  if (!database) return;
  database.pragma("wal_checkpoint(TRUNCATE)");
  database.close();
  database = null;
}

export const now = (): number => Date.now();
