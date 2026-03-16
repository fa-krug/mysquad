ALTER TABLE team_members ADD COLUMN deleted_at TEXT;
ALTER TABLE titles ADD COLUMN deleted_at TEXT;
ALTER TABLE salary_data_points ADD COLUMN deleted_at TEXT;
ALTER TABLE scenario_groups ADD COLUMN deleted_at TEXT;
