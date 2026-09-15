CREATE TABLE IF NOT EXISTS messages (
  number INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('bug','question','suggestion','comment')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed')),
  color INTEGER NOT NULL CHECK(color BETWEEN 0 AND 5),
  created_at TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'anonymous'
);
CREATE INDEX IF NOT EXISTS messages_state_number ON messages(state, number DESC);
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_number INTEGER NOT NULL REFERENCES messages(number) ON DELETE CASCADE,
  body TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'anonymous'
);
CREATE INDEX IF NOT EXISTS replies_message_id ON replies(message_number, id);
