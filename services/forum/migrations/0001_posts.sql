CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK(category IN ('城市發展','城中熱話','交通台','吹水台')),
  nickname TEXT NOT NULL DEFAULT '',
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'visible' CHECK(state IN ('visible','hidden')),
  created_at TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS posts_state_id ON posts(state, id DESC);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'visible' CHECK(state IN ('visible','hidden')),
  created_at TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS comments_post_id ON comments(post_id, id);
