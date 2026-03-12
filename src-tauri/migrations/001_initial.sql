-- App settings (key-value)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Titles lookup
CREATE TABLE IF NOT EXISTS titles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Team members
CREATE TABLE IF NOT EXISTS team_members (
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
    salary         INTEGER,
    start_date     DATE,
    notes          TEXT,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at on team_members
CREATE TRIGGER IF NOT EXISTS team_members_updated_at
    AFTER UPDATE ON team_members
    FOR EACH ROW
    WHEN OLD.updated_at = NEW.updated_at
BEGIN
    UPDATE team_members SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Children of team members
CREATE TABLE IF NOT EXISTS children (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    date_of_birth  DATE
);

-- Status items per team member
CREATE TABLE IF NOT EXISTS status_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    text           TEXT NOT NULL,
    checked        BOOLEAN DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Talk topics per team member
CREATE TABLE IF NOT EXISTS talk_topics (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    text           TEXT NOT NULL,
    checked        BOOLEAN DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);
