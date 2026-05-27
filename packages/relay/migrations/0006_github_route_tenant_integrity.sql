-- APP-018/019 quality fix: enforce tenant-scoped GitHub route ownership.
-- Rebuilds github_event_routes so server_id and installation_id cannot cross tenants.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE UNIQUE INDEX IF NOT EXISTS idx_computers_tenant_server_unique
  ON computers(tenant_id, server_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_github_installations_tenant_installation_unique
  ON github_app_installations(tenant_id, installation_id);

CREATE TABLE __app018_route_integrity_check (
  check_name TEXT PRIMARY KEY,
  orphan_count INTEGER NOT NULL CHECK (orphan_count = 0)
);

INSERT INTO __app018_route_integrity_check(check_name, orphan_count)
SELECT 'github_setup_sessions.tenant_server', COUNT(*)
FROM github_setup_sessions s
LEFT JOIN computers c
  ON c.tenant_id = s.tenant_id
 AND c.server_id = s.server_id
WHERE c.server_id IS NULL;

INSERT INTO __app018_route_integrity_check(check_name, orphan_count)
SELECT 'github_event_routes.tenant_server', COUNT(*)
FROM github_event_routes r
LEFT JOIN computers c
  ON c.tenant_id = r.tenant_id
 AND c.server_id = r.server_id
WHERE c.server_id IS NULL;

INSERT INTO __app018_route_integrity_check(check_name, orphan_count)
SELECT 'github_event_routes.tenant_installation', COUNT(*)
FROM github_event_routes r
LEFT JOIN github_app_installations i
  ON i.tenant_id = r.tenant_id
 AND i.installation_id = r.installation_id
WHERE i.installation_id IS NULL;

DROP TABLE __app018_route_integrity_check;

CREATE TABLE github_app_installations_new (
  installation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  account_login TEXT,
  account_type TEXT,
  repository_selection TEXT NOT NULL,
  suspended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

INSERT INTO github_app_installations_new(
  installation_id,
  tenant_id,
  account_login,
  account_type,
  repository_selection,
  suspended_at,
  created_at,
  updated_at
)
SELECT
  CAST(installation_id AS TEXT),
  tenant_id,
  account_login,
  account_type,
  repository_selection,
  suspended_at,
  created_at,
  updated_at
FROM github_app_installations;

DROP TABLE github_app_installations;
ALTER TABLE github_app_installations_new RENAME TO github_app_installations;

CREATE INDEX idx_github_app_installations_tenant
  ON github_app_installations(tenant_id);

CREATE UNIQUE INDEX idx_github_installations_tenant_installation_unique
  ON github_app_installations(tenant_id, installation_id);

CREATE TABLE github_setup_sessions_new (
  setup_token_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  return_url TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  FOREIGN KEY (tenant_id, server_id) REFERENCES computers(tenant_id, server_id)
);

INSERT INTO github_setup_sessions_new(
  setup_token_hash,
  tenant_id,
  server_id,
  return_url,
  expires_at,
  used_at,
  created_at
)
SELECT
  setup_token_hash,
  tenant_id,
  server_id,
  return_url,
  expires_at,
  used_at,
  created_at
FROM github_setup_sessions;

DROP TABLE github_setup_sessions;
ALTER TABLE github_setup_sessions_new RENAME TO github_setup_sessions;

CREATE INDEX idx_github_setup_sessions_tenant_server
  ON github_setup_sessions(tenant_id, server_id);

CREATE INDEX idx_github_setup_sessions_expiry
  ON github_setup_sessions(expires_at);

CREATE TABLE github_event_routes_new (
  route_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  automation_guid TEXT NOT NULL,
  installation_id TEXT NOT NULL,
  repository_id TEXT,
  repository_full_name TEXT NOT NULL,
  event_name TEXT NOT NULL,
  action TEXT,
  filters_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  route_status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  FOREIGN KEY (tenant_id, server_id) REFERENCES computers(tenant_id, server_id),
  FOREIGN KEY (tenant_id, installation_id) REFERENCES github_app_installations(tenant_id, installation_id)
);

INSERT INTO github_event_routes_new(
  route_id,
  tenant_id,
  server_id,
  automation_guid,
  installation_id,
  repository_id,
  repository_full_name,
  event_name,
  action,
  filters_json,
  enabled,
  route_status,
  created_at,
  updated_at
)
SELECT
  route_id,
  tenant_id,
  server_id,
  automation_guid,
  CAST(installation_id AS TEXT),
  CASE WHEN repository_id IS NULL THEN NULL ELSE CAST(repository_id AS TEXT) END,
  repository_full_name,
  event_name,
  action,
  filters_json,
  enabled,
  route_status,
  created_at,
  updated_at
FROM github_event_routes;

DROP TABLE github_event_routes;
ALTER TABLE github_event_routes_new RENAME TO github_event_routes;

CREATE INDEX idx_github_event_routes_repo_id_match
  ON github_event_routes(installation_id, repository_id, event_name, action, enabled, route_status);

CREATE INDEX idx_github_event_routes_full_name_match
  ON github_event_routes(installation_id, repository_full_name, event_name, action, enabled, route_status);

CREATE INDEX idx_github_event_routes_automation
  ON github_event_routes(server_id, automation_guid);

CREATE INDEX idx_github_event_routes_tenant
  ON github_event_routes(tenant_id, server_id);

CREATE INDEX idx_github_event_routes_tenant_installation
  ON github_event_routes(tenant_id, installation_id);

COMMIT;

PRAGMA foreign_keys = ON;
