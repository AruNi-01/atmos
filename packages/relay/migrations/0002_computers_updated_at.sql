-- Track last meaningful activity per registered computer (retention / manual cleanup).
-- online still uses last_seen_at (NULL when Server relay WS is disconnected).

ALTER TABLE computers ADD COLUMN updated_at INTEGER;

UPDATE computers
SET updated_at = COALESCE(last_seen_at, created_at)
WHERE updated_at IS NULL;
