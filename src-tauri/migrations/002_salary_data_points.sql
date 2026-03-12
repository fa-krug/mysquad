-- New salary data point tables

CREATE TABLE IF NOT EXISTS salary_data_points (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    budget     INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS salary_data_points_updated_at
    AFTER UPDATE ON salary_data_points
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE salary_data_points SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TABLE IF NOT EXISTS salary_data_point_members (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    data_point_id  INTEGER NOT NULL REFERENCES salary_data_points(id) ON DELETE CASCADE,
    member_id      INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    is_active      INTEGER NOT NULL DEFAULT 1,
    is_promoted    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(data_point_id, member_id)
);

CREATE TABLE IF NOT EXISTS salary_parts (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    data_point_member_id  INTEGER NOT NULL REFERENCES salary_data_point_members(id) ON DELETE CASCADE,
    name                  TEXT,
    amount                INTEGER NOT NULL DEFAULT 0,
    frequency             INTEGER NOT NULL DEFAULT 1,
    is_variable           INTEGER NOT NULL DEFAULT 0,
    sort_order            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS salary_ranges (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    data_point_id  INTEGER NOT NULL REFERENCES salary_data_points(id) ON DELETE CASCADE,
    title_id       INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    min_salary     INTEGER NOT NULL,
    max_salary     INTEGER NOT NULL,
    UNIQUE(data_point_id, title_id)
);

-- Seed data migration: import existing salary values into a data point
INSERT INTO salary_data_points (name)
SELECT 'Imported'
WHERE EXISTS (SELECT 1 FROM team_members WHERE salary IS NOT NULL);

INSERT INTO salary_data_point_members (data_point_id, member_id, is_active, is_promoted)
SELECT dp.id, m.id, 1, 0
FROM team_members m
CROSS JOIN salary_data_points dp
WHERE dp.name = 'Imported'
  AND dp.id = (SELECT MAX(id) FROM salary_data_points WHERE name = 'Imported');

INSERT INTO salary_parts (data_point_member_id, name, amount, frequency, is_variable, sort_order)
SELECT sdpm.id, 'Base', m.salary, 1, 0, 0
FROM team_members m
JOIN salary_data_point_members sdpm ON sdpm.member_id = m.id
JOIN salary_data_points dp ON dp.id = sdpm.data_point_id
WHERE dp.name = 'Imported'
  AND dp.id = (SELECT MAX(id) FROM salary_data_points WHERE name = 'Imported')
  AND m.salary IS NOT NULL;

-- Drop salary column from team_members (SQLite table recreation)
-- Must disable foreign keys for table recreation (children, status_items, talk_topics reference team_members)
PRAGMA foreign_keys = OFF;

CREATE TABLE team_members_new (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name     TEXT NOT NULL,
    last_name      TEXT NOT NULL,
    email          TEXT,
    personal_email TEXT,
    personal_phone TEXT,
    address_street TEXT,
    address_city   TEXT,
    address_zip    TEXT,
    title_id       INTEGER REFERENCES titles(id) ON DELETE RESTRICT,
    start_date     DATE,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO team_members_new (id, first_name, last_name, email, personal_email, personal_phone,
    address_street, address_city, address_zip, title_id, start_date, notes, created_at, updated_at)
SELECT id, first_name, last_name, email, personal_email, personal_phone,
    address_street, address_city, address_zip, title_id, start_date, notes, created_at, updated_at
FROM team_members;

DROP TABLE team_members;
ALTER TABLE team_members_new RENAME TO team_members;

PRAGMA foreign_keys = ON;

-- Recreate the updated_at trigger on the new table
CREATE TRIGGER IF NOT EXISTS team_members_updated_at
    AFTER UPDATE ON team_members
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE team_members SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
