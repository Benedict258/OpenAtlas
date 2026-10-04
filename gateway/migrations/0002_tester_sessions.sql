-- Real-world validation: one row per tester session, submitted through the website's /tester form.
-- Additive only. Apply to the live database once:
--   npx wrangler d1 execute openatlas --remote --file migrations/0002_tester_sessions.sql   (from gateway/)
CREATE TABLE IF NOT EXISTS tester_sessions (
  id                     TEXT PRIMARY KEY,
  created_at             INTEGER NOT NULL,
  tester_ref             TEXT NOT NULL,
  tester_type            TEXT NOT NULL,
  consent_store          INTEGER NOT NULL,
  consent_quote          TEXT NOT NULL,
  tested                 TEXT NOT NULL,
  languages              TEXT NOT NULL,
  outcome                TEXT NOT NULL,
  minutes_to_first_call  INTEGER,
  rating_setup           INTEGER,
  rating_quality         INTEGER,
  rating_docs            INTEGER,
  issues                 TEXT,
  issue_severity         TEXT,
  issue_report_id        TEXT,
  feedback               TEXT,
  api_key_label          TEXT
);
CREATE INDEX IF NOT EXISTS idx_tester_sessions_created ON tester_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_tester_sessions_ref ON tester_sessions (tester_ref);
