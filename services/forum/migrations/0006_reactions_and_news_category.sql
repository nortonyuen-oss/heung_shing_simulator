-- news_posts gets a category so it can slot into the same 4-tab filter as posts (default matches
-- syncPlayerNewsComments()'s existing hardcoded '城中熱話', so no backfill is needed).
ALTER TABLE news_posts ADD COLUMN category TEXT NOT NULL DEFAULT '城中熱話';
CREATE INDEX IF NOT EXISTS news_posts_category_id ON news_posts(category, state, id DESC);

-- Emoji reaction counters. Simple incrementing columns, not a per-visitor tracking table — a
-- deliberate choice for something this low-stakes; see reaction_log below for the abuse budget.
ALTER TABLE posts ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN laughs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN angry INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN shares INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN clowns INTEGER NOT NULL DEFAULT 0;

ALTER TABLE news_posts ADD COLUMN likes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_posts ADD COLUMN laughs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_posts ADD COLUMN angry INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_posts ADD COLUMN shares INTEGER NOT NULL DEFAULT 0;
ALTER TABLE news_posts ADD COLUMN clowns INTEGER NOT NULL DEFAULT 0;

-- Mirrors write_log exactly (same shape, same sliding-window query in recordToLedger()), but kept
-- as its own table so reacting a lot never eats into the strict text-content budget or vice versa.
CREATE TABLE IF NOT EXISTS reaction_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reaction_log_client_time ON reaction_log(client, created_at);
