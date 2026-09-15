-- Rolling log of anonymous writes, keyed by a salted hash of the client IP.
-- Rows older than the longest window are pruned on every write, so nothing here outlives an hour.
CREATE TABLE IF NOT EXISTS write_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS write_log_client_time ON write_log(client, created_at);
