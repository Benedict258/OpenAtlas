-- Self-serve API keys from the website's request form: keys are issued at once (no manual review), so
-- requests keep the details shown in the admin email and what the rate limits need. Additive only.
-- Apply to the live database once:
--   npx wrangler d1 execute openatlas --remote --file migrations/0003_self_serve_keys.sql   (from gateway/)
ALTER TABLE api_keys ADD COLUMN key_prefix TEXT;
ALTER TABLE key_requests ADD COLUMN organization TEXT;
ALTER TABLE key_requests ADD COLUMN ip_hash TEXT;
ALTER TABLE key_requests ADD COLUMN country TEXT;
CREATE INDEX IF NOT EXISTS idx_key_requests_email ON key_requests (email, created_at);
CREATE INDEX IF NOT EXISTS idx_key_requests_ip ON key_requests (ip_hash, created_at);
