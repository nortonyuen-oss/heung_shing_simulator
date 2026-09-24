-- 留言權: posting/commenting/reacting/ads now require a logged-in member (see worker.mjs's
-- requireMember() calls). member_id is nullable — NULL marks a row as guest/legacy content from
-- before this migration, never written by the Worker going forward. Not enforced NOT NULL at the
-- trigger level (0003/0005/0007's UPDATE triggers also fire on moderator hide/unhide/approve
-- actions, which must keep working on legacy guest rows) — app-level requireMember() is the only
-- guarantee that new rows carry a member_id.
ALTER TABLE posts ADD COLUMN member_id INTEGER REFERENCES members(id);
ALTER TABLE comments ADD COLUMN member_id INTEGER REFERENCES members(id);
ALTER TABLE news_comments ADD COLUMN member_id INTEGER REFERENCES members(id);
ALTER TABLE ads ADD COLUMN member_id INTEGER REFERENCES members(id);

CREATE INDEX IF NOT EXISTS posts_member_idx ON posts(member_id);
CREATE INDEX IF NOT EXISTS comments_member_idx ON comments(member_id);
CREATE INDEX IF NOT EXISTS news_comments_member_idx ON news_comments(member_id);
CREATE INDEX IF NOT EXISTS ads_member_idx ON ads(member_id);

-- Avatar upload (show-then-review, same posture as posts/comments): avatar_state defaults to
-- 'visible' the moment an upload lands, and a moderator can flip it to 'hidden' after the fact —
-- mirrors posts/comments/ads' own state column exactly.
ALTER TABLE members ADD COLUMN avatar_key TEXT;
ALTER TABLE members ADD COLUMN avatar_state TEXT NOT NULL DEFAULT 'visible' CHECK(avatar_state IN ('visible','hidden'));
ALTER TABLE members ADD COLUMN avatar_updated_at TEXT;
