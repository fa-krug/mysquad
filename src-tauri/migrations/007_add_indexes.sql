CREATE INDEX IF NOT EXISTS idx_team_members_title_id ON team_members(title_id);
CREATE INDEX IF NOT EXISTS idx_children_team_member_id ON children(team_member_id);
CREATE INDEX IF NOT EXISTS idx_status_items_team_member_id ON status_items(team_member_id);
CREATE INDEX IF NOT EXISTS idx_talk_topics_team_member_id ON talk_topics(team_member_id);
CREATE INDEX IF NOT EXISTS idx_project_members_team_member_id ON project_members(team_member_id);
CREATE INDEX IF NOT EXISTS idx_project_status_items_project_id ON project_status_items(project_id);
CREATE INDEX IF NOT EXISTS idx_salary_data_point_members_member_id ON salary_data_point_members(member_id);
CREATE INDEX IF NOT EXISTS idx_salary_parts_data_point_member_id ON salary_parts(data_point_member_id);
