-- Per-key limits and revocation details, plus indexes for per-key usage queries. Additive only.
-- Apply to the live database once:
--   npx wrangler d1 execute openatlas --remote --file migrations/0001_key_limits.sql   (from gateway/)
ALTER TABLE api_keys ADD COLUMN daily_request_limit INTEGER;
ALTER TABLE api_keys ADD COLUMN max_active_users INTEGER;
ALTER TABLE api_keys ADD COLUMN revoked_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_request_log_key_at ON request_log (key_id, at);
CREATE INDEX IF NOT EXISTS idx_active_users_key ON active_users (key_id, last_seen);
