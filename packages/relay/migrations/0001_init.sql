-- APP-016/019 control plane: stable tenant identity + registered computers.
-- Associations are logical: *_id columns are indexed and validated in Worker code,
-- but no physical foreign keys are created.

CREATE TABLE tenants (
  tenant_id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rotated_at INTEGER
);

CREATE TABLE register_tokens (
  token_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE computers (
  server_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  updated_at INTEGER,
  registration_meta TEXT
);

CREATE TABLE client_sessions (
  token_hash TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_register_tokens_tenant ON register_tokens(tenant_id);
CREATE INDEX idx_computers_tenant ON computers(tenant_id);
CREATE INDEX idx_client_sessions_tenant ON client_sessions(tenant_id);
CREATE INDEX idx_client_sessions_server ON client_sessions(server_id);
