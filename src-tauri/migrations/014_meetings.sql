-- Meetings table: records a 1:1 session with a team member
CREATE TABLE IF NOT EXISTS meetings (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    team_member_id INTEGER NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    date           TEXT NOT NULL DEFAULT (date('now')),
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Link status_items (updates) to the meeting they were created in
ALTER TABLE status_items ADD COLUMN meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL;

-- Link talk_topics to the meeting where they were checked off
ALTER TABLE talk_topics ADD COLUMN meeting_id INTEGER REFERENCES meetings(id) ON DELETE SET NULL;

-- Index for quick lookup of meetings by member
CREATE INDEX IF NOT EXISTS idx_meetings_team_member_id ON meetings(team_member_id);

-- Index for quick lookup of status_items by meeting
CREATE INDEX IF NOT EXISTS idx_status_items_meeting_id ON status_items(meeting_id);

-- Index for quick lookup of talk_topics by meeting
CREATE INDEX IF NOT EXISTS idx_talk_topics_meeting_id ON talk_topics(meeting_id);
