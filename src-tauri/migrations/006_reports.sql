CREATE TABLE reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'New Report',
    collect_statuses INTEGER NOT NULL DEFAULT 0,
    include_stakeholders INTEGER NOT NULL DEFAULT 0,
    include_projects INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
