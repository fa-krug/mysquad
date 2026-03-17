CREATE INDEX IF NOT EXISTS idx_scenario_group_members_group_active ON scenario_group_members(scenario_group_id, is_active, is_promoted);
CREATE INDEX IF NOT EXISTS idx_salary_data_point_members_data_point_id ON salary_data_point_members(data_point_id);
CREATE INDEX IF NOT EXISTS idx_salary_data_point_members_dp_member ON salary_data_point_members(data_point_id, member_id);
CREATE INDEX IF NOT EXISTS idx_team_members_deleted_at ON team_members(deleted_at);
CREATE INDEX IF NOT EXISTS idx_salary_data_points_deleted_at ON salary_data_points(deleted_at);
