-- APP-016: app-specific device id for coarse computer registration limits.

ALTER TABLE computers
  ADD COLUMN app_device_id TEXT;

CREATE INDEX idx_computers_app_device_id
  ON computers(app_device_id);
