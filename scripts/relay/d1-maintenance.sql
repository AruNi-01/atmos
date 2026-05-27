-- Atmos relay D1 maintenance (run manually in Cloudflare D1 console or wrangler d1 execute)
-- Database name: atmos-computer-cp (see packages/relay/wrangler.toml)
--
-- Prerequisites:
--   1. Apply migrations through packages/relay/migrations/0006 when needed.
--   2. Review each section; uncomment DELETE blocks only when ready.
--   3. Adjust retention intervals (default examples use 90 days for stale computers,
--      30 days for webhook delivery logs).
--
-- Example (from repo root):
--   npx wrangler d1 execute atmos-computer-cp --remote \
--     --config packages/relay/wrangler.toml \
--     --file=scripts/relay/d1-maintenance.sql
--
-- Or from packages/relay:
--   npx wrangler d1 execute atmos-computer-cp --remote \
--     --file=../../scripts/relay/d1-maintenance.sql

-- ---------------------------------------------------------------------------
-- 1) Expired one-time register tokens (safe; does not touch tenants/computers)
-- ---------------------------------------------------------------------------
DELETE FROM register_tokens
WHERE expires_at < unixepoch('now');

-- Optional: drop used register tokens older than 7 days
-- DELETE FROM register_tokens
-- WHERE used_at IS NOT NULL
--   AND used_at < unixepoch('now', '-7 days');

-- ---------------------------------------------------------------------------
-- 2) Expired client session rows (orphaned after TTL)
-- ---------------------------------------------------------------------------
DELETE FROM client_sessions
WHERE expires_at < unixepoch('now');

-- ---------------------------------------------------------------------------
-- 3) Expired GitHub setup sessions and old webhook delivery logs
-- ---------------------------------------------------------------------------
DELETE FROM github_setup_sessions
WHERE expires_at < unixepoch('now')
   OR (used_at IS NOT NULL AND used_at < unixepoch('now', '-7 days'));

DELETE FROM github_webhook_deliveries
WHERE received_at < unixepoch('now', '-30 days');

-- ---------------------------------------------------------------------------
-- 4) Preview stale computers (not revoked; inactive by updated_at)
--    Replace '-90 days' with your retention window.
-- ---------------------------------------------------------------------------
-- SELECT
--   server_id,
--   tenant_id,
--   display_name,
--   revoked,
--   created_at,
--   updated_at,
--   last_seen_at
-- FROM computers
-- WHERE revoked = 0
--   AND updated_at < unixepoch('now', '-90 days')
-- ORDER BY updated_at ASC;

-- ---------------------------------------------------------------------------
-- 5) Delete stale computers (run 5a before 5b)
-- ---------------------------------------------------------------------------

-- 5a) Remove client_sessions for computers that will be deleted
-- DELETE FROM client_sessions
-- WHERE server_id IN (
--   SELECT server_id
--   FROM computers
--   WHERE revoked = 0
--     AND updated_at < unixepoch('now', '-90 days')
-- );

-- 5b) Remove stale computer registrations (user must re-register on that machine)
-- DELETE FROM computers
-- WHERE revoked = 0
--   AND updated_at < unixepoch('now', '-90 days');

-- ---------------------------------------------------------------------------
-- 6) Optional: purge long-revoked computers (revoke already clears sessions in API)
-- ---------------------------------------------------------------------------
-- DELETE FROM client_sessions
-- WHERE server_id IN (
--   SELECT server_id
--   FROM computers
--   WHERE revoked = 1
--     AND updated_at < unixepoch('now', '-30 days')
-- );

-- DELETE FROM computers
-- WHERE revoked = 1
--   AND updated_at < unixepoch('now', '-30 days');
