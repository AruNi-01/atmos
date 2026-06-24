-- APP-019: coarse GitHub Trigger limits.

ALTER TABLE github_webhook_deliveries
  ADD COLUMN installation_id TEXT;

UPDATE github_webhook_deliveries
SET installation_id = (
  SELECT github_event_routes.installation_id
  FROM github_event_routes
  WHERE github_event_routes.route_id = github_webhook_deliveries.route_id
)
WHERE installation_id IS NULL;

CREATE INDEX idx_github_event_routes_tenant_active
  ON github_event_routes(tenant_id, enabled, route_status);

CREATE INDEX idx_github_event_routes_installation_active
  ON github_event_routes(installation_id, enabled, route_status);

CREATE INDEX idx_github_deliveries_tenant_received
  ON github_webhook_deliveries(tenant_id, received_at);

CREATE INDEX idx_github_deliveries_installation_received
  ON github_webhook_deliveries(installation_id, received_at);
