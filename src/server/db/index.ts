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
  if (!conversationCols.some((c) => c.name === "local_agent_id")) {
    database.exec("ALTER TABLE conversations ADD COLUMN local_agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE");
  }
  if (!conversationCols.some((c) => c.name === "agent_sdk_session_id")) {
    database.exec("ALTER TABLE conversations ADD COLUMN agent_sdk_session_id TEXT");
  }
  const runCols = database.prepare("PRAGMA table_info(agent_runs)").all() as { name: string }[];
  if (!runCols.some((c) => c.name === "cli")) {
    database.exec("ALTER TABLE agent_runs ADD COLUMN cli TEXT");
  }
  const scheduleCols = database.prepare("PRAGMA table_info(schedules)").all() as { name: string }[];
  if (!scheduleCols.some((c) => c.name === "agent_id")) {
    database.exec("ALTER TABLE schedules ADD COLUMN agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL");
  }
  dropLegacyProviderCheck(database);
  relaxAgentRunKindCheck(database);
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

// Older databases created agent_runs with CHECK (kind IN ('pty','orchestrated')), which rejects
// the 'agent' kind. SQLite can't ALTER a CHECK in place, so rebuild the table without it (the
// AgentRunKind Zod enum is the gate now). FK pragmas must be toggled outside the transaction;
// agent_events/permission_requests reference agent_runs by name, so RENAME keeps them valid.
function relaxAgentRunKindCheck(database: Database.Database): void {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'agent_runs'").get() as
    | { sql: string }
    | undefined;
  if (!table || !/CHECK\s*\(\s*kind/i.test(table.sql)) return;
  database.pragma("foreign_keys = OFF");
  database.transaction(() => {
    database.exec(`
      CREATE TABLE agent_runs_new (
        id              TEXT PRIMARY KEY,
        project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
        ticket_id       TEXT REFERENCES tickets(id) ON DELETE SET NULL,
        kind            TEXT NOT NULL,
        title           TEXT NOT NULL DEFAULT '',
        status          TEXT NOT NULL CHECK (status IN ('planning','awaiting_approval','running','done','failed','stopped')),
        approver        TEXT NOT NULL DEFAULT 'human' CHECK (approver IN ('human','agent')),
        permission_mode TEXT NOT NULL DEFAULT 'plan',
        model           TEXT,
        cli             TEXT,
        sdk_session_id  TEXT,
        cwd             TEXT NOT NULL,
        agent_def       TEXT,
        summary         TEXT,
        created_at      INTEGER NOT NULL,
        ended_at        INTEGER
      );
      INSERT INTO agent_runs_new SELECT
        id, project_id, ticket_id, kind, title, status, approver, permission_mode, model, cli,
        sdk_session_id, cwd, agent_def, summary, created_at, ended_at FROM agent_runs;
      DROP TABLE agent_runs;
      ALTER TABLE agent_runs_new RENAME TO agent_runs;
      CREATE INDEX IF NOT EXISTS idx_runs_project ON agent_runs(project_id);
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
