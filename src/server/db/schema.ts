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

CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT 'New conversation',
  created_at  INTEGER NOT NULL
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
  kind            TEXT NOT NULL CHECK (kind IN ('pty','orchestrated')),
  title           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL CHECK (status IN ('planning','awaiting_approval','running','done','failed','stopped')),
  approver        TEXT NOT NULL DEFAULT 'human' CHECK (approver IN ('human','agent')),
  permission_mode TEXT NOT NULL DEFAULT 'plan',
  model           TEXT,
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
`;
