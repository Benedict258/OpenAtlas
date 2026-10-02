-- OpenAtlas gateway storage (Cloudflare D1 / SQLite).

-- Developer keys. Only the SHA-256 hash is stored; the plaintext key is shown once at issue time.
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  key_hash    TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  revoked_at  INTEGER
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

-- Minimal request log, so usage can be audited against the license (no request content stored).
CREATE TABLE IF NOT EXISTS request_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          INTEGER NOT NULL,
  key_id      TEXT NOT NULL,
  route       TEXT NOT NULL,
  status      INTEGER NOT NULL,
  latency_ms  INTEGER NOT NULL
);
