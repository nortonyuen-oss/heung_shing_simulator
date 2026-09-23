-- SQLite triggers can't be altered in place. Only posts and news_posts changed shape (5 new
-- reaction columns each, plus a category column on news_posts), so only their triggers are
-- dropped and redefined here — comments/news_comments/ads are untouched from 0005.
DROP TRIGGER IF EXISTS posts_restrict_insert;
DROP TRIGGER IF EXISTS posts_restrict_update;
DROP TRIGGER IF EXISTS news_posts_restrict_insert;
DROP TRIGGER IF EXISTS news_posts_restrict_update;

CREATE TRIGGER posts_restrict_insert BEFORE INSERT ON posts
BEGIN
  SELECT RAISE(ABORT, 'posts: field restriction')
  WHERE NEW.category NOT IN ('城市發展','城中熱話','交通台','吹水台')
     OR length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
     OR NEW.likes < 0 OR NEW.laughs < 0 OR NEW.angry < 0 OR NEW.shares < 0 OR NEW.clowns < 0
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
CREATE TRIGGER posts_restrict_update BEFORE UPDATE ON posts
BEGIN
  SELECT RAISE(ABORT, 'posts: field restriction')
  WHERE NEW.category NOT IN ('城市發展','城中熱話','交通台','吹水台')
     OR length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
     OR NEW.likes < 0 OR NEW.laughs < 0 OR NEW.angry < 0 OR NEW.shares < 0 OR NEW.clowns < 0
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;

CREATE TRIGGER news_posts_restrict_insert BEFORE INSERT ON news_posts
BEGIN
  SELECT RAISE(ABORT, 'news_posts: field restriction')
  WHERE length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 3000
     OR length(NEW.image_key) > 100
     OR NEW.category NOT IN ('城市發展','城中熱話','交通台','吹水台')
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.likes < 0 OR NEW.laughs < 0 OR NEW.angry < 0 OR NEW.shares < 0 OR NEW.clowns < 0;
END;
CREATE TRIGGER news_posts_restrict_update BEFORE UPDATE ON news_posts
BEGIN
  SELECT RAISE(ABORT, 'news_posts: field restriction')
  WHERE length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 3000
     OR length(NEW.image_key) > 100
     OR NEW.category NOT IN ('城市發展','城中熱話','交通台','吹水台')
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.likes < 0 OR NEW.laughs < 0 OR NEW.angry < 0 OR NEW.shares < 0 OR NEW.clowns < 0;
END;
