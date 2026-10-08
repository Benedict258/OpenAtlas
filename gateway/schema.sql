-- OpenAtlas gateway storage (Cloudflare D1 / SQLite).

-- Developer keys. Only the SHA-256 hash is stored; the plaintext key is shown once at issue time.
-- Limits (NULL = none): daily_request_limit counts requests in the last 24 h; max_active_users is this
-- key's share of the N-ATLaS license cap, so one key can't use up every other key's headroom.
-- (Existing databases: migrations/0001_key_limits.sql adds the last three columns.)
CREATE TABLE IF NOT EXISTS api_keys (
  id                   TEXT PRIMARY KEY,
  key_hash             TEXT NOT NULL UNIQUE,
  label                TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  revoked_at           INTEGER,
  daily_request_limit  INTEGER,
  max_active_users     INTEGER,
  revoked_reason       TEXT
);

-- One row per distinct "user" for license-cap accounting.
-- subject_hash = SHA-256(key_id + ":" + end-user id from the request's required `user` field).
-- A user is "active" if last_seen falls in the rolling 30-day window.
CREATE TABLE IF NOT EXISTS active_users (
  subject_hash TEXT PRIMARY KEY,
  key_id       TEXT NOT NULL,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_active_users_last_seen ON active_users (last_seen);
CREATE INDEX IF NOT EXISTS idx_active_users_key ON active_users (key_id, last_seen);

-- Minimal request log, so usage can be audited against the license (no request content stored).
CREATE TABLE IF NOT EXISTS request_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  key_id      TEXT NOT NULL,
  route       TEXT NOT NULL,
  status      INTEGER NOT NULL,
  latency_ms  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_log_key_at ON request_log (key_id, at);

-- reportIssue(): flagged N-ATLaS outputs with a correction. Opt-in by construction: only what an
-- app explicitly sends to POST /v1/issues is stored. user_hash = SHA-256(key_id + ":" + user).
CREATE TABLE IF NOT EXISTS issue_reports (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  key_id        TEXT NOT NULL,
  user_hash     TEXT,
  kind          TEXT NOT NULL,          -- 'chat' | 'transcription'
  language      TEXT,
  input         TEXT,                   -- the prompt (chat); optional for transcription
  output        TEXT NOT NULL,          -- what N-ATLaS returned
  correction    TEXT NOT NULL,          -- what it should have been
  note          TEXT,
  audio_base64  TEXT                    -- optional clip for transcription issues (<= ~1 MB)
);
CREATE INDEX IF NOT EXISTS idx_issue_reports_created ON issue_reports (created_at);

-- API key requests from the website form. Reviewed by hand: POST /v1/admin/key-requests/decide with
-- decision "approve" issues a key (api_keys) and marks the request approved; "decline" marks it declined.
-- The key itself is never stored here.
CREATE TABLE IF NOT EXISTS key_requests (
  id              TEXT PRIMARY KEY,
  created_at      INTEGER NOT NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  project         TEXT NOT NULL,
  use_case        TEXT NOT NULL,
  expected_users  TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'declined'
  key_id          TEXT,
  decided_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_key_requests_status ON key_requests (status, created_at);

-- Real-world validation: one row per tester session, from the website's /tester form. Deliberately no
-- names or contact details: testers are given a reference (T01, T02, …) and the operator keeps the
-- reference → person mapping elsewhere. consent_store must be 1 for a row to exist; consent_quote says
-- whether feedback may be quoted in the submission ('named' | 'anonymous' | 'no'). tested and languages
-- are JSON arrays. Withdrawal: POST /v1/admin/tester-sessions/delete removes every row for a reference.
-- (Existing databases: migrations/0002_tester_sessions.sql.)
CREATE TABLE IF NOT EXISTS tester_sessions (
  id                     TEXT PRIMARY KEY,
  created_at             INTEGER NOT NULL,
  tester_ref             TEXT NOT NULL,
  tester_type            TEXT NOT NULL,          -- 'developer' | 'student' | 'organisation' | 'other'
  consent_store          INTEGER NOT NULL,
  consent_quote          TEXT NOT NULL,
  tested                 TEXT NOT NULL,
  languages              TEXT NOT NULL,
  outcome                TEXT NOT NULL,          -- 'worked' | 'partly' | 'failed'
  minutes_to_first_call  INTEGER,
  rating_setup           INTEGER,                -- 1-5
  rating_quality         INTEGER,                -- 1-5
  rating_docs            INTEGER,                -- 1-5
  issues                 TEXT,
  issue_severity         TEXT,                   -- 'none' | 'minor' | 'major' | 'blocker'
  issue_report_id        TEXT,                   -- optional reportIssue() id
  feedback               TEXT,
  api_key_label          TEXT                    -- label only, to match the tester's gateway usage
);
CREATE INDEX IF NOT EXISTS idx_tester_sessions_created ON tester_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_tester_sessions_ref ON tester_sessions (tester_ref);
