-- SQLite triggers can't be altered in place, so 0003's posts/comments triggers are dropped and
-- redefined here to also cover the new approved_for_game column; news_posts/news_comments/ads get
-- their own triggers for the first time, same defense-in-depth posture as 0003.
DROP TRIGGER IF EXISTS posts_restrict_insert;
DROP TRIGGER IF EXISTS posts_restrict_update;
DROP TRIGGER IF EXISTS comments_restrict_insert;
DROP TRIGGER IF EXISTS comments_restrict_update;

CREATE TRIGGER posts_restrict_insert BEFORE INSERT ON posts
BEGIN
  SELECT RAISE(ABORT, 'posts: field restriction')
  WHERE NEW.category NOT IN ('城市發展','城中熱話','交通台','吹水台')
     OR length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
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
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
CREATE TRIGGER comments_restrict_insert BEFORE INSERT ON comments
BEGIN
  SELECT RAISE(ABORT, 'comments: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
CREATE TRIGGER comments_restrict_update BEFORE UPDATE ON comments
BEGIN
  SELECT RAISE(ABORT, 'comments: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;

CREATE TRIGGER news_posts_restrict_insert BEFORE INSERT ON news_posts
BEGIN
  SELECT RAISE(ABORT, 'news_posts: field restriction')
  WHERE length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 3000
     OR length(NEW.image_key) > 100
     OR NEW.state NOT IN ('visible', 'hidden');
END;
CREATE TRIGGER news_posts_restrict_update BEFORE UPDATE ON news_posts
BEGIN
  SELECT RAISE(ABORT, 'news_posts: field restriction')
  WHERE length(NEW.headline) < 1 OR length(NEW.headline) > 220
     OR length(NEW.body) < 1 OR length(NEW.body) > 3000
     OR length(NEW.image_key) > 100
     OR NEW.state NOT IN ('visible', 'hidden');
END;

CREATE TRIGGER news_comments_restrict_insert BEFORE INSERT ON news_comments
BEGIN
  SELECT RAISE(ABORT, 'news_comments: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
CREATE TRIGGER news_comments_restrict_update BEFORE UPDATE ON news_comments
BEGIN
  SELECT RAISE(ABORT, 'news_comments: field restriction')
  WHERE length(NEW.body) < 1 OR length(NEW.body) > 1500
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;

CREATE TRIGGER ads_restrict_insert BEFORE INSERT ON ads
BEGIN
  SELECT RAISE(ABORT, 'ads: field restriction')
  WHERE length(NEW.ad_text) < 1 OR length(NEW.ad_text) > 120
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
CREATE TRIGGER ads_restrict_update BEFORE UPDATE ON ads
BEGIN
  SELECT RAISE(ABORT, 'ads: field restriction')
  WHERE length(NEW.ad_text) < 1 OR length(NEW.ad_text) > 120
     OR length(NEW.nickname) > 40
     OR NEW.state NOT IN ('visible', 'hidden')
     OR NEW.approved_for_game NOT IN (0, 1)
     OR length(NEW.request_key) < 16 OR length(NEW.request_key) > 80 OR NEW.request_key GLOB '*[^A-Za-z0-9-]*';
END;
