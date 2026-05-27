-- APP-018: GitHub Automation Triggers relay ingress.
-- Depends on APP-019 stable tenant ids in tenants(tenant_id).

CREATE TABLE github_app_installations (
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

CREATE TABLE github_setup_sessions (
  setup_token_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  return_url TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id),
  FOREIGN KEY (server_id) REFERENCES computers(server_id)
);

CREATE TABLE github_event_routes (
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
  FOREIGN KEY (server_id) REFERENCES computers(server_id),
  FOREIGN KEY (installation_id) REFERENCES github_app_installations(installation_id)
);

CREATE TABLE github_webhook_deliveries (
  delivery_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
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
  PRIMARY KEY (delivery_id, route_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_github_app_installations_tenant
  ON github_app_installations(tenant_id);

CREATE INDEX idx_github_setup_sessions_tenant_server
  ON github_setup_sessions(tenant_id, server_id);

CREATE INDEX idx_github_setup_sessions_expiry
  ON github_setup_sessions(expires_at);

CREATE INDEX idx_github_event_routes_match
  ON github_event_routes(installation_id, repository_full_name, event_name, action, enabled);

CREATE INDEX idx_github_event_routes_automation
  ON github_event_routes(server_id, automation_guid);

CREATE INDEX idx_github_event_routes_tenant
  ON github_event_routes(tenant_id, server_id);

CREATE INDEX idx_github_deliveries_received
  ON github_webhook_deliveries(received_at);

CREATE INDEX idx_github_deliveries_route
  ON github_webhook_deliveries(route_id, received_at);
