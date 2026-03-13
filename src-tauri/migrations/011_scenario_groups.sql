CREATE TABLE scenario_groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    budget INTEGER,
    previous_data_point_id INTEGER REFERENCES salary_data_points(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE scenario_group_ranges (
    id INTEGER PRIMARY KEY,
    scenario_group_id INTEGER NOT NULL REFERENCES scenario_groups(id) ON DELETE CASCADE,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    min_salary INTEGER NOT NULL DEFAULT 0,
    max_salary INTEGER NOT NULL DEFAULT 0,
    UNIQUE(scenario_group_id, title_id)
);

ALTER TABLE salary_data_points ADD COLUMN scenario_group_id INTEGER REFERENCES scenario_groups(id) ON DELETE CASCADE;
CREATE INDEX idx_salary_data_points_scenario_group ON salary_data_points(scenario_group_id);
