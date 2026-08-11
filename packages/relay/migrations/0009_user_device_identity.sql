-- APP-056: product identity is Hub user_id + device credentials.
-- No backward compatibility — wipe legacy token-tenant model.

DROP TABLE IF EXISTS github_webhook_deliveries;
DROP TABLE IF EXISTS github_event_routes;
DROP TABLE IF EXISTS github_setup_sessions;
DROP TABLE IF EXISTS github_app_installations;
DROP TABLE IF EXISTS client_sessions;
DROP TABLE IF EXISTS register_tokens;
DROP TABLE IF EXISTS computers;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS tenants;

-- Hub-projected devices (credential verified as Relay Bearer).
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  credential_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at INTEGER
);

CREATE INDEX idx_devices_user_id ON devices(user_id);

CREATE TABLE computers (
  server_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  enrolled_by_device_id TEXT,
  secret_hash TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  updated_at INTEGER,
  registration_meta TEXT,
  app_device_id TEXT
);

CREATE INDEX idx_computers_user_id ON computers(user_id);
CREATE INDEX idx_computers_app_device_id ON computers(app_device_id);

CREATE TABLE register_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  device_id TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE client_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  device_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- GitHub automation (APP-019) — owner column is user_id (Hub identity).
CREATE TABLE github_app_installations (
  installation_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_login TEXT,
  account_type TEXT,
  repository_selection TEXT NOT NULL,
  suspended_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE github_setup_sessions (
  setup_token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  return_url TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE github_event_routes (
  route_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
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
  updated_at INTEGER NOT NULL
);

CREATE TABLE github_webhook_deliveries (
  delivery_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  automation_guid TEXT NOT NULL,
  event_name TEXT NOT NULL,
  action TEXT,
  repository_full_name TEXT,
  status TEXT NOT NULL,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  received_at INTEGER NOT NULL,
  dispatched_at INTEGER,
  error_code TEXT,
  installation_id TEXT,
  PRIMARY KEY (delivery_id, route_id)
);

CREATE INDEX idx_github_app_installations_user
  ON github_app_installations(user_id);

CREATE INDEX idx_github_setup_sessions_user_server
  ON github_setup_sessions(user_id, server_id);

CREATE INDEX idx_github_setup_sessions_expiry
  ON github_setup_sessions(expires_at);

CREATE INDEX idx_github_event_routes_repo_id_match
  ON github_event_routes(installation_id, repository_id, event_name, action, enabled, route_status);

CREATE INDEX idx_github_event_routes_full_name_match
  ON github_event_routes(installation_id, repository_full_name, event_name, action, enabled, route_status);

CREATE INDEX idx_github_event_routes_automation
  ON github_event_routes(server_id, automation_guid);

CREATE INDEX idx_github_event_routes_user
  ON github_event_routes(user_id, server_id);

CREATE INDEX idx_github_event_routes_user_installation
  ON github_event_routes(user_id, installation_id);

CREATE INDEX idx_github_event_routes_user_active
  ON github_event_routes(user_id, enabled, route_status);

CREATE INDEX idx_github_event_routes_installation_active
  ON github_event_routes(installation_id, enabled, route_status);

CREATE INDEX idx_github_deliveries_received
  ON github_webhook_deliveries(received_at);

CREATE INDEX idx_github_deliveries_route
  ON github_webhook_deliveries(route_id, received_at);

CREATE INDEX idx_github_deliveries_user_received
  ON github_webhook_deliveries(user_id, received_at);

CREATE INDEX idx_github_deliveries_installation_received
  ON github_webhook_deliveries(installation_id, received_at);
