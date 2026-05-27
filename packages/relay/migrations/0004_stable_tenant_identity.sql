-- APP-019: stable tenant identity.
-- Moves access tokens from the tenant primary key into a credential column.

PRAGMA foreign_keys = OFF;

CREATE TABLE __app019_orphan_check (
  table_name TEXT PRIMARY KEY,
  orphan_count INTEGER NOT NULL CHECK (orphan_count = 0)
);

INSERT INTO __app019_orphan_check(table_name, orphan_count)
SELECT 'register_tokens', COUNT(*)
FROM register_tokens r
LEFT JOIN tenants t ON t.token_hash = r.tenant_id
WHERE t.token_hash IS NULL;

INSERT INTO __app019_orphan_check(table_name, orphan_count)
SELECT 'computers', COUNT(*)
FROM computers c
LEFT JOIN tenants t ON t.token_hash = c.tenant_id
WHERE t.token_hash IS NULL;

INSERT INTO __app019_orphan_check(table_name, orphan_count)
SELECT 'client_sessions', COUNT(*)
FROM client_sessions c
LEFT JOIN tenants t ON t.token_hash = c.tenant_id
WHERE t.token_hash IS NULL;

INSERT INTO __app019_orphan_check(table_name, orphan_count)
SELECT 'client_sessions.server_id', COUNT(*)
FROM client_sessions s
LEFT JOIN computers c ON c.server_id = s.server_id
WHERE c.server_id IS NULL;

DROP TABLE __app019_orphan_check;

ALTER TABLE tenants RENAME TO tenants_legacy;

CREATE TABLE tenants (
  tenant_id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  rotated_at INTEGER
);

INSERT INTO tenants(tenant_id, access_token_hash, created_at, updated_at, rotated_at)
SELECT 'tn_' || lower(hex(randomblob(16))), token_hash, created_at, created_at, NULL
FROM tenants_legacy;

CREATE TABLE register_tokens_new (
  token_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

INSERT INTO register_tokens_new(token_hash, tenant_id, expires_at, used_at, created_at)
SELECT r.token_hash, t.tenant_id, r.expires_at, r.used_at, r.created_at
FROM register_tokens r
JOIN tenants t ON t.access_token_hash = r.tenant_id;

DROP TABLE register_tokens;
ALTER TABLE register_tokens_new RENAME TO register_tokens;

CREATE TABLE computers_new (
  server_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  updated_at INTEGER,
  registration_meta TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

INSERT INTO computers_new(
  server_id,
  tenant_id,
  secret_hash,
  revoked,
  display_name,
  created_at,
  last_seen_at,
  updated_at,
  registration_meta
)
SELECT
  c.server_id,
  t.tenant_id,
  c.secret_hash,
  c.revoked,
  c.display_name,
  c.created_at,
  c.last_seen_at,
  COALESCE(c.updated_at, c.last_seen_at, c.created_at),
  c.registration_meta
FROM computers c
JOIN tenants t ON t.access_token_hash = c.tenant_id;

DROP TABLE computers;
ALTER TABLE computers_new RENAME TO computers;

CREATE TABLE client_sessions_new (
  token_hash TEXT PRIMARY KEY,
  server_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (server_id) REFERENCES computers(server_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

INSERT INTO client_sessions_new(token_hash, server_id, tenant_id, expires_at, created_at)
SELECT c.token_hash, c.server_id, t.tenant_id, c.expires_at, c.created_at
FROM client_sessions c
JOIN tenants t ON t.access_token_hash = c.tenant_id;

DROP TABLE client_sessions;
ALTER TABLE client_sessions_new RENAME TO client_sessions;

DROP TABLE tenants_legacy;

CREATE INDEX idx_register_tokens_tenant ON register_tokens(tenant_id);
CREATE INDEX idx_computers_tenant ON computers(tenant_id);
CREATE INDEX idx_client_sessions_tenant ON client_sessions(tenant_id);
CREATE INDEX idx_client_sessions_server ON client_sessions(server_id);

PRAGMA foreign_keys = ON;
