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
  if (!conversationCols.some((c) => c.name === "genie_conversation_id")) {
    database.exec("ALTER TABLE conversations ADD COLUMN genie_conversation_id TEXT");
  }
  const runCols = database.prepare("PRAGMA table_info(agent_runs)").all() as { name: string }[];
  if (!runCols.some((c) => c.name === "cli")) {
    database.exec("ALTER TABLE agent_runs ADD COLUMN cli TEXT");
  }
  dropLegacyProviderCheck(database);
  return database;
}

// Older databases created the registered_agents table with CHECK (provider IN ('databricks')),
// which rejects new providers like 'databricks_genie'. SQLite can't ALTER a CHECK in place, so
// rebuild the table without it (the AgentProvider Zod enum is the gate now). FK pragmas must be
// toggled outside the transaction; conversations.agent_id references by name, so RENAME keeps it valid.
function dropLegacyProviderCheck(database: Database.Database): void {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'registered_agents'").get() as
    | { sql: string }
    | undefined;
  if (!table || !/CHECK\s*\(\s*provider/i.test(table.sql)) return;
  database.pragma("foreign_keys = OFF");
  database.transaction(() => {
    database.exec(`
      CREATE TABLE registered_agents_new (
        id          TEXT PRIMARY KEY,
        provider    TEXT NOT NULL,
        name        TEXT NOT NULL,
        endpoint    TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      INSERT INTO registered_agents_new (id, provider, name, endpoint, description, created_at, updated_at)
        SELECT id, provider, name, endpoint, description, created_at, updated_at FROM registered_agents;
      DROP TABLE registered_agents;
      ALTER TABLE registered_agents_new RENAME TO registered_agents;
    `);
  })();
  database.pragma("foreign_keys = ON");
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
