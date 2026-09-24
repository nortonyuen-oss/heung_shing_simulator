-- Member accounts for 香城街坊福利會 — additive identity layer, entirely separate from the
-- anonymous nickname system every other table already uses. username_lower is a UNIQUE index so
-- "Norton" and "norton" collide at registration instead of silently becoming two accounts; username
-- itself keeps the display casing the member typed.
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Same shape as login_attempts, deliberately a separate table: heavy member login traffic must
-- never eat into (or be capped by) the moderator's own login budget.
CREATE TABLE IF NOT EXISTS member_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS member_login_attempts_client_time ON member_login_attempts(client, created_at);
