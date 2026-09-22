-- Splits "visible on the website" (existing `state`) from "approved to sync into the game"
-- (new `approved_for_game`): the website can stay post-then-moderate, while what actually reaches
-- players inside the game requires the moderator to say so first.
ALTER TABLE posts ADD COLUMN approved_for_game INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN approved_for_game INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS posts_game_queue ON posts(approved_for_game, state, id DESC);
CREATE INDEX IF NOT EXISTS comments_game_queue ON comments(approved_for_game, state, id DESC);

CREATE TABLE IF NOT EXISTS news_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  image_key TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'visible' CHECK(state IN ('visible','hidden')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS news_posts_state_id ON news_posts(state, id DESC);

-- Only the moderator authors news_posts (writing one is itself the approval), but the public can
-- reply, so news_comments needs the same website/game split as posts/comments above.
CREATE TABLE IF NOT EXISTS news_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  news_post_id INTEGER NOT NULL REFERENCES news_posts(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'visible' CHECK(state IN ('visible','hidden')),
  approved_for_game INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS news_comments_post_id ON news_comments(news_post_id, id);
CREATE INDEX IF NOT EXISTS news_comments_game_queue ON news_comments(approved_for_game, state, id DESC);

CREATE TABLE IF NOT EXISTS ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL DEFAULT '',
  ad_text TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'visible' CHECK(state IN ('visible','hidden')),
  approved_for_game INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS ads_game_queue ON ads(approved_for_game, state, id DESC);

-- Independent budget from write_log: a wrong password guess must never share (or be capped by)
-- the content-posting rate limit.
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_client_time ON login_attempts(client, created_at);
