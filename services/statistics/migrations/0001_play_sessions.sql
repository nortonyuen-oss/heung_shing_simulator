CREATE TABLE IF NOT EXISTS play_events (
  event_hash TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  received_at TEXT NOT NULL,
  game_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS play_events_received ON play_events(received_at);
CREATE TABLE IF NOT EXISTS play_days (day TEXT PRIMARY KEY, sessions INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS play_totals (
  id INTEGER PRIMARY KEY CHECK(id = 1), sessions INTEGER NOT NULL DEFAULT 0,
  since TEXT NOT NULL, updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO play_totals VALUES (1, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TRIGGER IF NOT EXISTS play_daily_cap BEFORE INSERT ON play_events
WHEN COALESCE((SELECT sessions FROM play_days WHERE day = NEW.day), 0) >= 5000
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER IF NOT EXISTS play_count AFTER INSERT ON play_events
BEGIN
  INSERT INTO play_days(day, sessions) VALUES (NEW.day, 1)
    ON CONFLICT(day) DO UPDATE SET sessions = sessions + 1;
  UPDATE play_totals SET sessions = sessions + 1, updated_at = NEW.received_at WHERE id = 1;
END;
