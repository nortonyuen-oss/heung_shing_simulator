-- Second wall behind the Worker's field checks: the database itself refuses rows that break the
-- length caps or closed lists, whatever path wrote them. SQLite cannot add CHECK constraints to an
-- existing table, so these run as BEFORE INSERT / BEFORE UPDATE triggers.
CREATE TRIGGER IF NOT EXISTS posts_restrict_insert BEFORE INSERT ON posts
BEGIN
  SELECT RAISE(ABORT, 'posts: field restriction')
  WHERE NEW.category NOT IN ('城市發展','城中熱話','交通台','吹水台')
     OR length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
CREATE TRIGGER IF NOT EXISTS posts_restrict_update BEFORE UPDATE ON posts
BEGIN
  SELECT RAISE(ABORT, 'posts: field restriction')
  WHERE NEW.category NOT IN ('城市發展','城中熱話','交通台','吹水台')
     OR length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
CREATE TRIGGER IF NOT EXISTS comments_restrict_insert BEFORE INSERT ON comments
BEGIN
  SELECT RAISE(ABORT, 'comments: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
CREATE TRIGGER IF NOT EXISTS comments_restrict_update BEFORE UPDATE ON comments
BEGIN
  SELECT RAISE(ABORT, 'comments: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
