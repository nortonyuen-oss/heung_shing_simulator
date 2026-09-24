-- Defense-in-depth, same posture as 0003/0005: even a direct D1 bypass can't write an out-of-policy
-- member row. username_lower's own length mirrors username's since the Worker always derives one
-- from the other before insert.
CREATE TRIGGER members_restrict_insert BEFORE INSERT ON members
BEGIN
  SELECT RAISE(ABORT, 'members: field restriction')
  WHERE length(NEW.username) < 2 OR length(NEW.username) > 40
     OR length(NEW.username_lower) < 2 OR length(NEW.username_lower) > 40
     OR length(NEW.password_hash) < 1
     OR length(NEW.created_at) < 1;
END;
CREATE TRIGGER members_restrict_update BEFORE UPDATE ON members
BEGIN
  SELECT RAISE(ABORT, 'members: field restriction')
  WHERE length(NEW.username) < 2 OR length(NEW.username) > 40
     OR length(NEW.username_lower) < 2 OR length(NEW.username_lower) > 40
     OR length(NEW.password_hash) < 1
     OR length(NEW.created_at) < 1;
END;
