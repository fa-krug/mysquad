CREATE TABLE scenario_group_members (
    id INTEGER PRIMARY KEY,
    scenario_group_id INTEGER NOT NULL REFERENCES scenario_groups(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_promoted INTEGER NOT NULL DEFAULT 0,
    promoted_title_id INTEGER REFERENCES titles(id) ON DELETE SET NULL,
    UNIQUE(scenario_group_id, member_id)
);

-- Backfill from existing scenario groups: copy member attributes from the first child
INSERT INTO scenario_group_members (scenario_group_id, member_id, is_active, is_promoted, promoted_title_id)
SELECT sg.id, sdpm.member_id, sdpm.is_active, sdpm.is_promoted, sdpm.promoted_title_id
FROM scenario_groups sg
JOIN salary_data_points sdp ON sdp.scenario_group_id = sg.id
JOIN salary_data_point_members sdpm ON sdpm.data_point_id = sdp.id
WHERE sdp.id = (
    SELECT MIN(sdp2.id) FROM salary_data_points sdp2 WHERE sdp2.scenario_group_id = sg.id
);
