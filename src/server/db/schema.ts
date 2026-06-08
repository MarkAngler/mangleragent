export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  path         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  columns_json TEXT NOT NULL,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  column_id   TEXT NOT NULL,
  position    REAL NOT NULL,
  labels_json TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tickets_project ON tickets(project_id);

CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  done        INTEGER NOT NULL DEFAULT 0,
  due         INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS registered_agents (
  id          TEXT PRIMARY KEY,
  -- No CHECK: the AgentProvider Zod enum gates this at the POST boundary, and a
  -- SQLite CHECK on a fast-moving enum only buys recurring migration pain.
  provider    TEXT NOT NULL,
  name        TEXT NOT NULL,
  endpoint    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Specialized agents built in-app and run locally on the Claude Agent SDK. No CHECK on
-- type/approval: the AgentType/AgentApproval Zod enums gate these at the POST boundary.
CREATE TABLE IF NOT EXISTS agents (
  id                  TEXT PRIMARY KEY,
  type                TEXT NOT NULL DEFAULT 'task',
  name                TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  system_prompt       TEXT NOT NULL DEFAULT '',
  model               TEXT,
  mcp_server_ids_json TEXT NOT NULL DEFAULT '[]',
  approval            TEXT NOT NULL DEFAULT 'none',
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  -- No CHECK: the McpTransport Zod enum gates this at the POST boundary.
  transport   TEXT NOT NULL,
  command     TEXT NOT NULL DEFAULT '',
  args_json   TEXT NOT NULL DEFAULT '[]',
  env_json    TEXT NOT NULL DEFAULT '{}',
  url         TEXT NOT NULL DEFAULT '',
  headers_json TEXT NOT NULL DEFAULT '{}',
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL DEFAULT 'New conversation',
  agent_id             TEXT REFERENCES registered_agents(id) ON DELETE CASCADE,
  local_agent_id       TEXT REFERENCES agents(id) ON DELETE CASCADE,
  genie_conversation_id TEXT,
  -- SDK session id for a local-agent chat, so follow-up turns resume the same session.
  agent_sdk_session_id TEXT,
  created_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content_json    TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS agent_runs (
  id              TEXT PRIMARY KEY,
  project_id      TEXT REFERENCES projects(id) ON DELETE SET NULL,
  ticket_id       TEXT REFERENCES tickets(id) ON DELETE SET NULL,
  -- No CHECK: the AgentRunKind Zod enum ('pty' | 'orchestrated' | 'agent') gates this at the boundary.
  kind            TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL CHECK (status IN ('planning','awaiting_approval','running','done','failed','stopped')),
  approver        TEXT NOT NULL DEFAULT 'human' CHECK (approver IN ('human','agent')),
  permission_mode TEXT NOT NULL DEFAULT 'plan',
  model           TEXT,
  -- Which CLI a pty terminal spawns ('claude' | 'codex'); null on orchestrated runs.
  -- No CHECK: the TerminalCli Zod enum gates this at the POST boundary.
  cli             TEXT,
  sdk_session_id  TEXT,
  cwd             TEXT NOT NULL,
  agent_def       TEXT,
  summary         TEXT,
  created_at      INTEGER NOT NULL,
  ended_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON agent_runs(project_id);

CREATE TABLE IF NOT EXISTS agent_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  type        TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_run ON agent_events(run_id);

CREATE TABLE IF NOT EXISTS permission_requests (
  id          TEXT PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,
  input_json  TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'tool' CHECK (kind IN ('tool','plan')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  approver    TEXT NOT NULL DEFAULT 'human',
  decided_by  TEXT,
  reason      TEXT,
  created_at  INTEGER NOT NULL,
  decided_at  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_perms_run ON permission_requests(run_id);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  cron            TEXT NOT NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  -- When set, the occurrence runs this agent directly instead of Mangler.
  agent_id        TEXT REFERENCES agents(id) ON DELETE SET NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  last_run_at     INTEGER,
  next_run_at     INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules(enabled, next_run_at);
`;
