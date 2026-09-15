-- Second wall behind the Worker's field checks: the database itself refuses rows that break the
-- length caps or closed lists, whatever path wrote them. SQLite cannot add CHECK constraints to an
-- existing table, so these run as BEFORE INSERT / BEFORE UPDATE triggers.
CREATE TRIGGER IF NOT EXISTS messages_restrict_insert BEFORE INSERT ON messages
BEGIN
  SELECT RAISE(ABORT, 'messages: field restriction')
  WHERE length(NEW.title) < 1 OR length(NEW.title) > 120
     OR length(NEW.body) < 1 OR length(NEW.body) > 6000
     OR length(NEW.nickname) > 40
     OR length(NEW.version) > 40
     OR NEW.platform NOT IN ('', 'Windows', 'macOS (Apple Silicon)', 'macOS (Intel)', 'Other')
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*'
     OR NEW.source NOT IN ('anonymous', 'moderator');
END;
CREATE TRIGGER IF NOT EXISTS messages_restrict_update BEFORE UPDATE ON messages
BEGIN
  SELECT RAISE(ABORT, 'messages: field restriction')
  WHERE length(NEW.title) < 1 OR length(NEW.title) > 120
     OR length(NEW.body) < 1 OR length(NEW.body) > 6000
     OR length(NEW.nickname) > 40
     OR length(NEW.version) > 40
     OR NEW.platform NOT IN ('', 'Windows', 'macOS (Apple Silicon)', 'macOS (Intel)', 'Other')
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*'
     OR NEW.source NOT IN ('anonymous', 'moderator');
END;
CREATE TRIGGER IF NOT EXISTS replies_restrict_insert BEFORE INSERT ON replies
BEGIN
  SELECT RAISE(ABORT, 'replies: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 6000
     OR length(NEW.nickname) > 40
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*'
     OR NEW.source NOT IN ('anonymous', 'moderator');
END;
CREATE TRIGGER IF NOT EXISTS replies_restrict_update BEFORE UPDATE ON replies
BEGIN
  SELECT RAISE(ABORT, 'replies: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 6000
     OR length(NEW.nickname) > 40
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*'
     OR NEW.source NOT IN ('anonymous', 'moderator');
END;
