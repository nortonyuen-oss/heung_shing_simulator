-- 留言權: submitting a memo/reply now requires a logged-in member (see worker.mjs's requireMember()
-- calls). members live in services/forum's D1, a different database — D1 has no cross-database
-- join, so member_id here is NOT a foreign key, and member_username is a write-time snapshot taken
-- straight from the verified token's payload (safe indefinitely: there is no rename feature, a
-- member's username never changes after registration). NULL member_id marks a row as guest/legacy
-- content from before this migration.
ALTER TABLE messages ADD COLUMN member_id INTEGER;
ALTER TABLE messages ADD COLUMN member_username TEXT;
ALTER TABLE replies ADD COLUMN member_id INTEGER;
ALTER TABLE replies ADD COLUMN member_username TEXT;

-- Widen source's closed list to admit 'member' alongside the existing 'anonymous'/'moderator'.
-- SQLite triggers can't be ALTERed, so this drops and recreates them exactly as 0003 defined them,
-- changing only the source check (same posture as forum's 0005_field_restrictions_v2.sql).
DROP TRIGGER IF EXISTS messages_restrict_insert;
DROP TRIGGER IF EXISTS messages_restrict_update;
DROP TRIGGER IF EXISTS replies_restrict_insert;
DROP TRIGGER IF EXISTS replies_restrict_update;

CREATE TRIGGER messages_restrict_insert BEFORE INSERT ON messages
BEGIN
  SELECT RAISE(ABORT, 'messages: field restriction')
  WHERE length(NEW.title) < 1 OR length(NEW.title) > 120
     OR length(NEW.body) < 1 OR length(NEW.body) > 6000
     OR length(NEW.nickname) > 40
     OR length(NEW.version) > 40
     OR NEW.platform NOT IN ('', 'Windows', 'macOS (Apple Silicon)', 'macOS (Intel)', 'Other')
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*'
     OR NEW.source NOT IN ('anonymous', 'moderator', 'member');
END;
CREATE TRIGGER messages_restrict_update BEFORE UPDATE ON messages
BEGIN
  SELECT RAISE(ABORT, 'messages: field restriction')
  WHERE length(NEW.title) < 1 OR length(NEW.title) > 120
     OR length(NEW.body) < 1 OR length(NEW.body) > 6000
     OR length(NEW.nickname) > 40
     OR length(NEW.version) > 40
     OR NEW.platform NOT IN ('', 'Windows', 'macOS (Apple Silicon)', 'macOS (Intel)', 'Other')
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*'
     OR NEW.source NOT IN ('anonymous', 'moderator', 'member');
END;
CREATE TRIGGER replies_restrict_insert BEFORE INSERT ON replies
BEGIN
  SELECT RAISE(ABORT, 'replies: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 6000
     OR length(NEW.nickname) > 40
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*'
     OR NEW.source NOT IN ('anonymous', 'moderator', 'member');
END;
CREATE TRIGGER replies_restrict_update BEFORE UPDATE ON replies
BEGIN
  SELECT RAISE(ABORT, 'replies: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 6000
     OR length(NEW.nickname) > 40
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*'
     OR NEW.source NOT IN ('anonymous', 'moderator', 'member');
END;
